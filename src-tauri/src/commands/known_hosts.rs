//! `known_hosts_*` Tauri commands. Glue between the front-end Known Hosts
//! settings page and the TOFU store.

use tauri::State;

use crate::models::KnownHost;
use crate::store::{known_hosts as dao, DbPool};
use crate::AppError;

#[tauri::command]
pub async fn list_known_hosts(pool: State<'_, DbPool>) -> Result<Vec<KnownHost>, AppError> {
    Ok(dao::list(pool.inner()).await?)
}

/// "Forget" an endpoint — the next connection will re-apply TOFU and record
/// whatever fingerprint the server presents. Useful after a legitimate host
/// key rotation, or to manually clear a stale entry.
#[tauri::command]
pub async fn forget_known_host(
    pool: State<'_, DbPool>,
    hostname: String,
    port: u16,
) -> Result<bool, AppError> {
    Ok(dao::forget(pool.inner(), &hostname, port).await?)
}
