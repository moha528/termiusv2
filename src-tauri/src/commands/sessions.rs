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

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::models::Host;
use crate::ssh::{new_entry, ConnectParams, Session, SessionManager};
use crate::store::{hosts as hosts_dao, DbPool};
use crate::AppError;

/// Payload emitted on the `session-closed-{id}` event.
#[derive(Debug, Clone, Serialize)]
pub struct SessionClosedEvent {
    pub session_id: String,
    pub reason: String,
}

/// Open a new SSH session against `host_id`. `password` is taken inline for
/// now; future tickets (P3-T06) will resolve it from the OS keychain.
#[tauri::command]
pub async fn open_ssh_session(
    app: AppHandle,
    pool: State<'_, DbPool>,
    sessions: State<'_, SessionManager>,
    host_id: String,
    password: String,
) -> Result<String, AppError> {
    let host: Host = hosts_dao::get(pool.inner(), &host_id).await?;

    let port: u16 = host.port.try_into().map_err(|_| {
        AppError(anyhow::anyhow!(
            "invalid port {} for host {}",
            host.port,
            host.label
        ))
    })?;

    let session = Session::connect(
        pool.inner(),
        ConnectParams {
            hostname: &host.hostname,
            port,
            username: &host.username,
            password: &password,
        },
    )
    .await
    .map_err(|e| AppError(anyhow::anyhow!(e.to_string())))?;

    let (pty, mut rx) = session
        .open_pty(80, 24)
        .await
        .map_err(|e| AppError(anyhow::anyhow!(e.to_string())))?;

    let mut entry = new_entry(session);
    entry.pty = Some(pty);
    let id = entry.id;
    sessions.insert(entry).await;

    let app_handle = app.clone();
    let sessions_handle = sessions.inner().clone();
    let data_event = format!("terminal-data-{id}");
    let close_event = format!("session-closed-{id}");

    tokio::spawn(async move {
        while let Some(chunk) = rx.recv().await {
            if let Err(e) = app_handle.emit(&data_event, chunk) {
                tracing::warn!("emit {data_event}: {e}");
                break;
            }
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

/// Push keyboard input to the PTY of an existing session.
#[tauri::command]
pub async fn send_terminal_input(
    sessions: State<'_, SessionManager>,
    session_id: String,
    data: String,
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
    pty.write(data.as_bytes())
        .map_err(|e| AppError(anyhow::anyhow!(e)))?;
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
    session_id: String,
) -> Result<(), AppError> {
    let id = parse_id(&session_id)?;
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
