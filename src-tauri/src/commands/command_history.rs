//! Tauri commands: command history (P4-T03).

use tauri::State;

use crate::models::CommandHistoryEntry;
use crate::store::{command_history as dao, DbPool};
use crate::AppError;

/// `limit` is bounded server-side so a buggy front can't ask for the whole table.
const DEFAULT_LIMIT: i64 = 200;
const MAX_LIMIT: i64 = 1000;

#[tauri::command]
pub async fn list_command_history(
    pool: State<'_, DbPool>,
    host_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<CommandHistoryEntry>, AppError> {
    let n = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    Ok(dao::recent(pool.inner(), host_id.as_deref(), n).await?)
}

#[tauri::command]
pub async fn clear_command_history(
    pool: State<'_, DbPool>,
    host_id: Option<String>,
) -> Result<u64, AppError> {
    Ok(dao::clear(pool.inner(), host_id.as_deref()).await?)
}
