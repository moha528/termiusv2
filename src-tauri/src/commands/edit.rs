//! Tauri commands for the "edit remote file" flow (P2-T13).

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::edit::{EditEntry, EditRegistry};
use crate::sftp::SftpClient;
use crate::ssh::SessionManager;
use crate::AppError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditStartedEvent {
    pub edit_id: String,
    pub session_id: String,
    pub remote_path: String,
    pub local_path: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditSyncEvent {
    pub edit_id: String,
    pub bytes: u64,
    pub timestamp_ms: u128,
}

/// Download `remote_path`, open it in the OS-default editor, then poll the
/// local file every 500 ms and re-upload any modification.
#[tauri::command]
pub async fn open_remote_edit(
    app: AppHandle,
    sessions: State<'_, SessionManager>,
    edits: State<'_, EditRegistry>,
    session_id: String,
    remote_path: String,
) -> Result<EditStartedEvent, AppError> {
    // 1. Look up the SSH session
    let id = Uuid::parse_str(&session_id)
        .map_err(|e| AppError(anyhow::anyhow!("bad session id: {e}")))?;
    let entry = sessions
        .get(id)
        .await
        .ok_or_else(|| AppError(anyhow::anyhow!("session {session_id} not found")))?;
    let session_handle = entry.lock().await.session.handle().clone();

    // 2. Compute the local scratch path
    let edit_id = Uuid::new_v4().to_string();
    let basename = remote_path
        .rsplit('/')
        .find(|s| !s.is_empty())
        .unwrap_or("file")
        .to_string();
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError(anyhow::anyhow!("app data dir: {e}")))?;
    let local_dir = app_data.join("edits").join(&edit_id);
    tokio::fs::create_dir_all(&local_dir)
        .await
        .map_err(|e| AppError(anyhow::anyhow!(e)))?;
    let local_path = local_dir.join(&basename);

    // 3. Initial download
    let no_cancel = Arc::new(AtomicBool::new(false));
    let sftp = SftpClient::open(&session_handle)
        .await
        .map_err(AppError::from)?;
    sftp.download(&remote_path, &local_path, no_cancel.clone(), |_, _| {})
        .await
        .map_err(AppError::from)?;

    // 4. Open with default app
    tauri_plugin_opener::open_path(local_path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| AppError(anyhow::anyhow!("open editor: {e}")))?;

    // 5. Register + spawn the watcher
    let cancel = Arc::new(AtomicBool::new(false));
    edits
        .register(EditEntry {
            edit_id: edit_id.clone(),
            session_id: session_id.clone(),
            remote_path: remote_path.clone(),
            local_path: local_path.clone(),
            cancel: cancel.clone(),
        })
        .await;

    spawn_watcher(
        app.clone(),
        session_handle,
        edit_id.clone(),
        remote_path.clone(),
        local_path.clone(),
        cancel,
    );

    Ok(EditStartedEvent {
        edit_id,
        session_id,
        remote_path,
        local_path: local_path.to_string_lossy().into_owned(),
        name: basename,
    })
}

#[tauri::command]
pub async fn cancel_remote_edit(
    edits: State<'_, EditRegistry>,
    edit_id: String,
) -> Result<bool, AppError> {
    Ok(edits.cancel(&edit_id).await)
}

/// Poll the local file every 500 ms and re-upload whenever the mtime moves.
/// The watcher exits when `cancel` is set or when the local file disappears.
fn spawn_watcher(
    app: AppHandle,
    handle: Arc<russh::client::Handle<crate::ssh::client::Handler>>,
    edit_id: String,
    remote_path: String,
    local_path: PathBuf,
    cancel: Arc<AtomicBool>,
) {
    tokio::spawn(async move {
        let mut last_mtime = match tokio::fs::metadata(&local_path).await {
            Ok(m) => m.modified().ok(),
            Err(_) => return,
        };
        let event_name = format!("edit-saved-{edit_id}");

        loop {
            tokio::time::sleep(Duration::from_millis(500)).await;
            if cancel.load(Ordering::Relaxed) {
                break;
            }

            let Ok(meta) = tokio::fs::metadata(&local_path).await else {
                // file gone — abort gracefully
                break;
            };
            let current = meta.modified().ok();
            if current == last_mtime {
                continue;
            }
            last_mtime = current;

            // Spin up a fresh SFTP subsystem each time so a long-lived
            // re-upload doesn't sit on the cached one (interactive listings
            // keep working).
            match SftpClient::open(&handle).await {
                Ok(sftp) => {
                    let no_cancel = Arc::new(AtomicBool::new(false));
                    if let Err(e) = sftp
                        .upload(&local_path, &remote_path, no_cancel, |_, _| {})
                        .await
                    {
                        tracing::warn!("edit re-upload {edit_id}: {e}");
                        continue;
                    }
                    let bytes = meta.len();
                    let ts = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis();
                    let _ = app.emit(
                        &event_name,
                        EditSyncEvent {
                            edit_id: edit_id.clone(),
                            bytes,
                            timestamp_ms: ts,
                        },
                    );
                }
                Err(e) => tracing::warn!("edit re-open sftp {edit_id}: {e}"),
            }
        }

        // Cleanup the scratch dir on exit (best-effort).
        if let Some(parent) = local_path.parent() {
            let _ = tokio::fs::remove_dir_all(parent).await;
        }
    });
}
