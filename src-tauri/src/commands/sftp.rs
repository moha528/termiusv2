//! Tauri commands wrapping the SFTP subsystem for a given session.
//!
//! Every command takes a `session_id` (the UUID returned by
//! [`super::sessions::open_ssh_session`]) and lazily opens the SFTP subsystem
//! on first use, cached on the `SessionEntry`. Subsequent calls reuse the
//! same subsystem channel to avoid an extra round-trip per command.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::models::FileEntry;
use crate::sftp::SftpClient;
use crate::ssh::{SessionEntry, SessionManager};
use crate::AppError;

type EntryHandle = Arc<Mutex<SessionEntry>>;

/// Resolve `session_id` and make sure SFTP is initialised.
async fn ensure_sftp(sessions: &SessionManager, session_id: &str) -> Result<EntryHandle, AppError> {
    let id = Uuid::parse_str(session_id)
        .map_err(|e| AppError(anyhow::anyhow!("bad session id: {e}")))?;
    let entry = sessions
        .get(id)
        .await
        .ok_or_else(|| AppError(anyhow::anyhow!("session {session_id} not found")))?;

    {
        let mut e = entry.lock().await;
        if e.sftp.is_none() {
            let client = SftpClient::open(e.session.handle())
                .await
                .map_err(|err| AppError(anyhow::anyhow!("open sftp: {err}")))?;
            e.sftp = Some(client);
        }
    }
    Ok(entry)
}

#[tauri::command]
pub async fn sftp_list_dir(
    sessions: State<'_, SessionManager>,
    session_id: String,
    path: String,
) -> Result<Vec<FileEntry>, AppError> {
    let entry = ensure_sftp(sessions.inner(), &session_id).await?;
    let guard = entry.lock().await;
    let sftp = guard.sftp.as_ref().expect("sftp initialised");
    Ok(sftp.read_dir(&path).await?)
}

#[tauri::command]
pub async fn sftp_stat(
    sessions: State<'_, SessionManager>,
    session_id: String,
    path: String,
) -> Result<FileEntry, AppError> {
    let entry = ensure_sftp(sessions.inner(), &session_id).await?;
    let guard = entry.lock().await;
    let sftp = guard.sftp.as_ref().expect("sftp initialised");
    Ok(sftp.stat(&path).await?)
}

#[tauri::command]
pub async fn sftp_mkdir(
    sessions: State<'_, SessionManager>,
    session_id: String,
    path: String,
) -> Result<(), AppError> {
    let entry = ensure_sftp(sessions.inner(), &session_id).await?;
    let guard = entry.lock().await;
    let sftp = guard.sftp.as_ref().expect("sftp initialised");
    Ok(sftp.create_dir(&path).await?)
}

#[tauri::command]
pub async fn sftp_remove(
    sessions: State<'_, SessionManager>,
    session_id: String,
    path: String,
) -> Result<(), AppError> {
    let entry = ensure_sftp(sessions.inner(), &session_id).await?;
    let guard = entry.lock().await;
    let sftp = guard.sftp.as_ref().expect("sftp initialised");
    Ok(sftp.remove(&path).await?)
}

#[tauri::command]
pub async fn sftp_rename(
    sessions: State<'_, SessionManager>,
    session_id: String,
    from: String,
    to: String,
) -> Result<(), AppError> {
    let entry = ensure_sftp(sessions.inner(), &session_id).await?;
    let guard = entry.lock().await;
    let sftp = guard.sftp.as_ref().expect("sftp initialised");
    Ok(sftp.rename(&from, &to).await?)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferProgress {
    pub transfer_id: String,
    pub bytes_done: u64,
    pub total_bytes: u64,
    pub bytes_per_sec: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferDone {
    pub transfer_id: String,
    pub bytes_transferred: u64,
    pub elapsed_ms: u64,
    pub error: Option<String>,
}

/// Throttle progress events so we never emit faster than once every ~100ms
/// nor less often than every chunk near the end. Anything finer-grained just
/// floods the IPC bridge for no UX benefit.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

#[tauri::command]
pub async fn sftp_upload(
    app: AppHandle,
    sessions: State<'_, SessionManager>,
    session_id: String,
    local_path: String,
    remote_path: String,
) -> Result<String, AppError> {
    let session_handle = clone_session_handle(sessions.inner(), &session_id).await?;
    let transfer_id = Uuid::new_v4().to_string();
    spawn_transfer(
        app,
        session_handle,
        transfer_id.clone(),
        TransferKind::Upload {
            local: PathBuf::from(local_path),
            remote: remote_path,
        },
    );
    Ok(transfer_id)
}

#[tauri::command]
pub async fn sftp_download(
    app: AppHandle,
    sessions: State<'_, SessionManager>,
    session_id: String,
    remote_path: String,
    local_path: String,
) -> Result<String, AppError> {
    let session_handle = clone_session_handle(sessions.inner(), &session_id).await?;
    let transfer_id = Uuid::new_v4().to_string();
    spawn_transfer(
        app,
        session_handle,
        transfer_id.clone(),
        TransferKind::Download {
            remote: remote_path,
            local: PathBuf::from(local_path),
        },
    );
    Ok(transfer_id)
}

enum TransferKind {
    Upload { local: PathBuf, remote: String },
    Download { remote: String, local: PathBuf },
}

async fn clone_session_handle(
    sessions: &SessionManager,
    session_id: &str,
) -> Result<Arc<russh::client::Handle<crate::ssh::client::Handler>>, AppError> {
    let id = Uuid::parse_str(session_id)
        .map_err(|e| AppError(anyhow::anyhow!("bad session id: {e}")))?;
    let entry = sessions
        .get(id)
        .await
        .ok_or_else(|| AppError(anyhow::anyhow!("session {session_id} not found")))?;
    let guard = entry.lock().await;
    Ok(guard.session.handle().clone())
}

fn spawn_transfer(
    app: AppHandle,
    handle: Arc<russh::client::Handle<crate::ssh::client::Handler>>,
    transfer_id: String,
    kind: TransferKind,
) {
    tokio::spawn(async move {
        let started = Instant::now();
        let result = run_transfer(&app, &handle, &transfer_id, kind, started).await;
        let elapsed_ms = started.elapsed().as_millis() as u64;
        let done = match result {
            Ok(bytes_transferred) => TransferDone {
                transfer_id: transfer_id.clone(),
                bytes_transferred,
                elapsed_ms,
                error: None,
            },
            Err(e) => TransferDone {
                transfer_id: transfer_id.clone(),
                bytes_transferred: 0,
                elapsed_ms,
                error: Some(e.to_string()),
            },
        };
        let _ = app.emit(&format!("transfer-done-{transfer_id}"), done);
    });
}

async fn run_transfer(
    app: &AppHandle,
    handle: &Arc<russh::client::Handle<crate::ssh::client::Handler>>,
    transfer_id: &str,
    kind: TransferKind,
    started: Instant,
) -> anyhow::Result<u64> {
    // Dedicated SFTP channel so interactive listings keep working in parallel.
    let sftp = SftpClient::open(handle).await?;

    let mut last_emit = Instant::now() - PROGRESS_INTERVAL;
    let event_name = format!("transfer-progress-{transfer_id}");
    let mut on_progress = |done: u64, total: u64| {
        if last_emit.elapsed() < PROGRESS_INTERVAL && done < total {
            return;
        }
        last_emit = Instant::now();
        let elapsed_secs = started.elapsed().as_secs_f64().max(0.001);
        let speed = (done as f64 / elapsed_secs) as u64;
        let payload = TransferProgress {
            transfer_id: transfer_id.to_string(),
            bytes_done: done,
            total_bytes: total,
            bytes_per_sec: speed,
        };
        let _ = app.emit(&event_name, payload);
    };

    match kind {
        TransferKind::Upload { local, remote } => {
            sftp.upload(&local, &remote, &mut on_progress).await
        }
        TransferKind::Download { remote, local } => {
            sftp.download(&remote, &local, &mut on_progress).await
        }
    }
}
