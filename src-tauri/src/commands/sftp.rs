//! Tauri commands wrapping the SFTP subsystem for a given session.
//!
//! Every command takes a `session_id` (the UUID returned by
//! [`super::sessions::open_ssh_session`]) and lazily opens the SFTP subsystem
//! on first use, cached on the `SessionEntry`. Subsequent calls reuse the
//! same subsystem channel to avoid an extra round-trip per command.

use std::sync::Arc;

use tauri::State;
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
