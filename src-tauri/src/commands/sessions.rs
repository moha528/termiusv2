//! Tauri commands managing SSH sessions and their PTYs.
//!
//! Lifecycle:
//! 1. [`open_ssh_session`] connects + opens a PTY, returns a session id.
//! 2. The backend continuously emits `terminal-data-{session_id}` events with
//!    the raw bytes received from the server.
//! 3. The frontend echoes user input through [`send_terminal_input`] and
//!    window changes through [`resize_terminal`].
//! 4. [`close_session`] disposes the PTY and the underlying SSH connection.
//! 5. When the server closes the connection (or the PTY task exits), the
//!    backend emits a final `session-closed-{session_id}` event.

use std::io::Write;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::command_capture::CommandCapture;
use crate::keyvault;
use crate::models::Host;
use crate::ssh::{new_entry, ConnectParams, KeyAuth, Session, SessionManager};
use crate::ssh_keys;
use crate::store::{
    command_history as history_dao, hosts as hosts_dao, identities as identities_dao,
    ssh_keys as keys_dao, DbPool,
};
use crate::AppError;

/// Payload emitted on the `session-closed-{id}` event.
#[derive(Debug, Clone, Serialize)]
pub struct SessionClosedEvent {
    pub session_id: String,
    pub reason: String,
}

/// Open a new SSH session against `host_id`. If the host has a
/// `proxy_jump_host_id` configured, the connection is tunneled through that
/// bastion first (recursively if the bastion itself has a proxy).
#[tauri::command]
pub async fn open_ssh_session(
    app: AppHandle,
    pool: State<'_, DbPool>,
    sessions: State<'_, SessionManager>,
    host_id: String,
    password: String,
) -> Result<String, AppError> {
    // Resolve the host upfront so we know whether to tee the PTY to a log
    // file (P3-T15). This is the same Host that `open_chain` will look up
    // recursively, but we need its top-level flags for the emit task.
    let host: Host = hosts_dao::get(pool.inner(), &host_id).await?;

    // P4-T06 — run the local pre-connect script *before* we touch SSH.
    // Failures are logged but do not abort the connection: the user might
    // have a `wake-on-lan` line that races with `mosh-server`, both of
    // which are "best effort" by nature.
    if !host.pre_connect_script.trim().is_empty() {
        run_pre_connect_script(&host.pre_connect_script, &host.label).await;
    }

    let session = open_chain(pool.inner(), &host_id, &password, &mut Vec::new())
        .await
        .map_err(|e| AppError(anyhow::anyhow!(e.to_string())))?;

    // PTY agent forwarding follows the effective identity if any (P4-T05),
    // otherwise the host's own flag.
    let effective_agent_forward = match host.identity_id.as_deref() {
        Some(identity_id) => identities_dao::get(pool.inner(), identity_id)
            .await
            .map(|i| i.agent_forward)
            .unwrap_or(host.agent_forward),
        None => host.agent_forward,
    };
    let (pty, mut rx) = session
        .open_pty(80, 24, effective_agent_forward)
        .await
        .map_err(|e| AppError(anyhow::anyhow!(e.to_string())))?;

    let mut entry = new_entry(session);
    entry.pty = Some(pty);
    entry.host_id = Some(host_id.clone());
    let id = entry.id;
    sessions.insert(entry).await;

    // P4-T06 — push the post-connect script into the PTY now that the shell
    // is allocated. We schedule it on a short delay so the server has time
    // to print its motd / prompt before our lines arrive, otherwise the
    // first command tends to be eaten by the login banner.
    let post_script = host.post_connect_script.clone();
    if !post_script.trim().is_empty() {
        let entry_ref = sessions.inner().clone();
        let host_label = host.label.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            let Some(arc) = entry_ref.get(id).await else {
                return;
            };
            let entry = arc.lock().await;
            let Some(pty) = entry.pty.as_ref() else {
                return;
            };
            let bytes = normalise_script(&post_script);
            if let Err(e) = pty.write(bytes.as_bytes()) {
                tracing::warn!(host = %host_label, error = %e, "post_connect_script write");
            }
        });
    }

    let app_handle = app.clone();
    let sessions_handle = sessions.inner().clone();
    let data_event = format!("terminal-data-{id}");
    let close_event = format!("session-closed-{id}");

    // Pre-create the log file handle once if logging is enabled, so each
    // chunk is just a write call. We use std::io here (not tokio::fs)
    // because PTY chunks are small and frequent — std buffered I/O is
    // simpler and good enough.
    let mut log_file: Option<std::fs::File> = if host.log_to_file {
        open_log_file(&app, &host).ok()
    } else {
        None
    };

    tokio::spawn(async move {
        while let Some(chunk) = rx.recv().await {
            if let Some(f) = log_file.as_mut() {
                if let Err(e) = f.write_all(&chunk) {
                    tracing::warn!("audit log write: {e}");
                    log_file = None; // stop trying after the first failure
                }
            }
            if let Err(e) = app_handle.emit(&data_event, chunk) {
                tracing::warn!("emit {data_event}: {e}");
                break;
            }
        }
        if let Some(mut f) = log_file.take() {
            let _ = f.flush();
        }
        // Cleanup: remove the entry from the registry and notify the front.
        let _ = sessions_handle.remove(id).await;
        let _ = app_handle.emit(
            &close_event,
            SessionClosedEvent {
                session_id: id.to_string(),
                reason: "stream-ended".into(),
            },
        );
    });

    Ok(id.to_string())
}

/// Resolve `<app_data_dir>/logs/<host_id>/<YYYY-MM-DD_HH-MM-SS>.log` and
/// open it append-mode. Creates parent dirs as needed.
fn open_log_file(app: &AppHandle, host: &Host) -> Result<std::fs::File, AppError> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError(anyhow::anyhow!("resolve app data dir: {e}")))?;
    let dir: PathBuf = app_data.join("logs").join(&host.id);
    std::fs::create_dir_all(&dir)
        .map_err(|e| AppError(anyhow::anyhow!("create log dir {}: {e}", dir.display())))?;
    let stamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let path = dir.join(format!("{stamp}.log"));
    let file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| AppError(anyhow::anyhow!("open log {}: {e}", path.display())))?;
    tracing::info!(host = %host.label, file = %path.display(), "audit log started");
    Ok(file)
}

/// Push keyboard input to the PTY of an existing session.
#[tauri::command]
pub async fn send_terminal_input(
    pool: State<'_, DbPool>,
    sessions: State<'_, SessionManager>,
    capture: State<'_, CommandCapture>,
    session_id: String,
    data: String,
) -> Result<(), AppError> {
    let id = parse_id(&session_id)?;
    let entry = sessions
        .get(id)
        .await
        .ok_or_else(|| AppError(anyhow::anyhow!("session {session_id} not found")))?;
    let host_id = {
        let entry = entry.lock().await;
        let pty = entry
            .pty
            .as_ref()
            .ok_or_else(|| AppError(anyhow::anyhow!("session {session_id} has no PTY")))?;
        pty.write(data.as_bytes())
            .map_err(|e| AppError(anyhow::anyhow!(e)))?;
        entry.host_id.clone()
    };

    // Capture completed commands and persist them in the background — never
    // block PTY input on the DB write.
    let commands = capture.feed(id, &data).await;
    if !commands.is_empty() {
        let pool = pool.inner().clone();
        tokio::spawn(async move {
            for cmd in commands {
                if let Err(e) = history_dao::record(&pool, host_id.as_deref(), &cmd).await {
                    tracing::warn!("record command_history: {e}");
                }
            }
        });
    }
    Ok(())
}

/// Forward a window size change to the server.
#[tauri::command]
pub async fn resize_terminal(
    sessions: State<'_, SessionManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), AppError> {
    let id = parse_id(&session_id)?;
    let entry = sessions
        .get(id)
        .await
        .ok_or_else(|| AppError(anyhow::anyhow!("session {session_id} not found")))?;
    let entry = entry.lock().await;
    let pty = entry
        .pty
        .as_ref()
        .ok_or_else(|| AppError(anyhow::anyhow!("session {session_id} has no PTY")))?;
    pty.resize(cols, rows)
        .map_err(|e| AppError(anyhow::anyhow!(e)))?;
    Ok(())
}

/// Close a session: tears down the PTY and the SSH transport.
#[tauri::command]
pub async fn close_session(
    sessions: State<'_, SessionManager>,
    capture: State<'_, CommandCapture>,
    session_id: String,
) -> Result<(), AppError> {
    let id = parse_id(&session_id)?;
    capture.forget(id).await;
    let Some(entry) = sessions.remove(id).await else {
        return Ok(());
    };
    // Take ownership of the entry contents so we can move them into close().
    let mut entry = entry.lock_owned().await;
    if let Some(pty) = entry.pty.take() {
        if let Err(e) = pty.close().await {
            tracing::warn!("close pty {id}: {e}");
        }
    }
    // The Session is moved out by swapping it with a deferred construction trick
    // is impossible (no Default for Session). We drop the lock and let the
    // entry go out of scope: this drops the russh handle which sends a clean
    // disconnect best-effort.
    drop(entry);
    Ok(())
}

fn parse_id(s: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(s).map_err(|e| AppError(anyhow::anyhow!("invalid session id: {e}")))
}

/// Replace `\r\n` and `\n` with `\r` (what an interactive terminal expects
/// for "Enter"), and guarantee a trailing `\r` so the last command runs.
fn normalise_script(script: &str) -> String {
    let mut out = script.replace("\r\n", "\r").replace('\n', "\r");
    if !out.ends_with('\r') {
        out.push('\r');
    }
    out
}

/// Run each non-empty, non-comment line of `script` through the OS shell.
/// Each line gets up to 30 s before we give up (per line). Output goes to
/// the app log; the user can inspect it via the tracing subscriber when
/// debugging.
async fn run_pre_connect_script(script: &str, host_label: &str) {
    for raw in script.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut cmd = if cfg!(target_os = "windows") {
            let mut c = tokio::process::Command::new("cmd");
            c.args(["/C", line]);
            c
        } else {
            let mut c = tokio::process::Command::new("sh");
            c.args(["-c", line]);
            c
        };
        cmd.kill_on_drop(true);
        match tokio::time::timeout(std::time::Duration::from_secs(30), cmd.status()).await {
            Ok(Ok(status)) if status.success() => {
                tracing::info!(host = %host_label, cmd = line, "pre_connect_script line OK");
            }
            Ok(Ok(status)) => {
                tracing::warn!(host = %host_label, cmd = line, code = ?status.code(), "pre_connect_script non-zero");
            }
            Ok(Err(e)) => {
                tracing::warn!(host = %host_label, cmd = line, error = %e, "pre_connect_script spawn");
            }
            Err(_) => {
                tracing::warn!(host = %host_label, cmd = line, "pre_connect_script timeout (30 s)");
            }
        }
    }
}

/// Recursively open the SSH chain for `host_id`, threading through any
/// `proxy_jump_host_id`. Detects cycles via `visited` and surfaces a clear
/// error rather than recursing forever.
///
/// The leaf-most call is the **target** host and uses the user-provided
/// `password`. Every bastion above it falls back to whatever password is
/// stored in the OS keychain (`keyvault::get_secret(bastion.id)`); if none
/// is present we still try with empty password — key auth may succeed.
async fn open_chain(
    pool: &DbPool,
    host_id: &str,
    password: &str,
    visited: &mut Vec<String>,
) -> Result<Session, anyhow::Error> {
    if visited.iter().any(|h| h == host_id) {
        return Err(anyhow::anyhow!(
            "ProxyJump cycle detected: {host_id} appears twice in the chain"
        ));
    }
    visited.push(host_id.to_string());

    let host: Host = hosts_dao::get(pool, host_id).await?;
    let port: u16 = host
        .port
        .try_into()
        .map_err(|_| anyhow::anyhow!("invalid port {} for host {}", host.port, host.label))?;

    // P4-T05 — if the host references an identity, resolve its keys + flags
    // and let them override the host's own values. The host's `username` and
    // `agent_forward` are kept as fallbacks for when the user clears the
    // identity later.
    let (effective_username, effective_agent_fwd, key_rows) = match host.identity_id.as_deref() {
        Some(identity_id) => {
            let identity = identities_dao::get(pool, identity_id).await?;
            let keys = identities_dao::list_keys_for_identity(pool, identity_id).await?;
            (identity.username, identity.agent_forward, keys)
        }
        None => {
            let keys = keys_dao::list_for_host(pool, host_id).await?;
            (host.username.clone(), host.agent_forward, keys)
        }
    };
    let keys: Vec<KeyAuth> = key_rows
        .into_iter()
        .map(|k| {
            let passphrase = if k.has_passphrase {
                keyvault::get_secret(&ssh_keys::passphrase_account(&k.id))
                    .ok()
                    .flatten()
            } else {
                None
            };
            KeyAuth {
                private_key_path: k.private_key_path,
                passphrase,
            }
        })
        .collect();

    let params = ConnectParams {
        hostname: &host.hostname,
        port,
        username: &effective_username,
        password,
        keys,
        agent_forward: effective_agent_fwd,
    };

    match host.proxy_jump_host_id.as_deref() {
        None => Ok(Session::connect(pool, params).await?),
        Some(bastion_id) => {
            // For bastions further up the chain we can't ask the user for a
            // password interactively — we use whatever was saved (which may
            // be empty if the bastion uses key auth only).
            let bastion_password = keyvault::get_secret(bastion_id)
                .ok()
                .flatten()
                .unwrap_or_default();
            let bastion =
                Box::pin(open_chain(pool, bastion_id, &bastion_password, visited)).await?;
            Ok(Session::connect_via_bastion(pool, *Box::new(bastion), params).await?)
        }
    }
}
