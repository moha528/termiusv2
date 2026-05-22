//! `hosts_*` Tauri commands. Thin wrappers over [`crate::store::hosts`].

use tauri::State;

use crate::models::{Host, HostInput};
use crate::store::{hosts as dao, DbPool};
use crate::AppError;

#[tauri::command]
pub async fn list_hosts(pool: State<'_, DbPool>) -> Result<Vec<Host>, AppError> {
    Ok(dao::list(pool.inner()).await?)
}

#[tauri::command]
pub async fn create_host(pool: State<'_, DbPool>, input: HostInput) -> Result<Host, AppError> {
    Ok(dao::create(pool.inner(), input).await?)
}

#[tauri::command]
pub async fn update_host(
    pool: State<'_, DbPool>,
    id: String,
    input: HostInput,
) -> Result<Host, AppError> {
    Ok(dao::update(pool.inner(), &id, input).await?)
}

#[tauri::command]
pub async fn delete_host(pool: State<'_, DbPool>, id: String) -> Result<bool, AppError> {
    Ok(dao::delete(pool.inner(), &id).await?)
}
