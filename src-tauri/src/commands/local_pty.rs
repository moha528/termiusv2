//! Tauri commands driving local PTY sessions. Mirrors `commands::sessions`
//! but for non-SSH child shells.

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::command_capture::CommandCapture;
use crate::local_pty::{LocalSession, LocalSessionManager};
use crate::store::{command_history as history_dao, DbPool};
use crate::AppError;

#[derive(Debug, Clone, Serialize)]
pub struct LocalClosedEvent {
    pub session_id: String,
    pub reason: String,
}

/// Spawn a local shell. `shell` overrides the auto-detected default
/// (`$SHELL`, or `pwsh`/`powershell`/`cmd` on Windows). Returns the
/// session id used by the front-end events / commands.
#[tauri::command]
pub async fn open_local_session(
    app: AppHandle,
    sessions: State<'_, LocalSessionManager>,
    shell: Option<String>,
) -> Result<String, AppError> {
    let (session, mut rx) = LocalSession::spawn(shell.as_deref(), 80, 24)
        .map_err(|e| AppError(anyhow::anyhow!(e.to_string())))?;
    let id = sessions.insert(session).await;

    let app_handle = app.clone();
    let sessions_handle = sessions.inner().clone();
    let data_event = format!("terminal-data-{id}");
    let close_event = format!("session-closed-{id}");

    tokio::spawn(async move {
        // Tauri events are not buffered: bytes emitted before the frontend
        // registers its listener are lost. SSH sessions naturally take long
        // enough that the front is always ready before the shell prompt
        // arrives, but a local shell prints its prompt within microseconds,
        // so without this small head-start the user sees an empty terminal
        // until they press a key. The reader thread keeps reading into the
        // bounded channel meanwhile, so no bytes are dropped — they just
        // wait here.
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        while let Some(chunk) = rx.recv().await {
            if let Err(e) = app_handle.emit(&data_event, chunk) {
                tracing::warn!("emit {data_event}: {e}");
                break;
            }
        }
        let _ = sessions_handle.remove(id).await;
        let _ = app_handle.emit(
            &close_event,
            LocalClosedEvent {
                session_id: id.to_string(),
                reason: "shell-exited".into(),
            },
        );
    });

    Ok(id.to_string())
}

#[tauri::command]
pub async fn local_send_input(
    pool: State<'_, DbPool>,
    sessions: State<'_, LocalSessionManager>,
    capture: State<'_, CommandCapture>,
    session_id: String,
    data: String,
) -> Result<(), AppError> {
    let id = parse_id(&session_id)?;
    let entry = sessions
        .get(id)
        .await
        .ok_or_else(|| AppError(anyhow::anyhow!("local session {session_id} not found")))?;
    {
        let mut entry = entry.lock().await;
        entry
            .write(data.as_bytes())
            .map_err(|e| AppError(anyhow::anyhow!(e)))?;
    }

    let commands = capture.feed(id, &data).await;
    if !commands.is_empty() {
        let pool = pool.inner().clone();
        tokio::spawn(async move {
            for cmd in commands {
                if let Err(e) = history_dao::record(&pool, None, &cmd).await {
                    tracing::warn!("record command_history (local): {e}");
                }
            }
        });
    }
    Ok(())
}

#[tauri::command]
pub async fn local_resize(
    sessions: State<'_, LocalSessionManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), AppError> {
    let id = parse_id(&session_id)?;
    let entry = sessions
        .get(id)
        .await
        .ok_or_else(|| AppError(anyhow::anyhow!("local session {session_id} not found")))?;
    let entry = entry.lock().await;
    entry
        .resize(cols, rows)
        .map_err(|e| AppError(anyhow::anyhow!(e)))?;
    Ok(())
}

#[tauri::command]
pub async fn local_close(
    sessions: State<'_, LocalSessionManager>,
    capture: State<'_, CommandCapture>,
    session_id: String,
) -> Result<(), AppError> {
    let id = parse_id(&session_id)?;
    capture.forget(id).await;
    let Some(entry) = sessions.remove(id).await else {
        return Ok(());
    };
    let mut entry = entry.lock_owned().await;
    if let Err(e) = entry.kill() {
        tracing::warn!("close local {id}: {e}");
    }
    Ok(())
}

fn parse_id(s: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(s).map_err(|e| AppError(anyhow::anyhow!("invalid session id: {e}")))
}
