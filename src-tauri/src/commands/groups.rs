//! `groups_*` Tauri commands. Thin wrappers over [`crate::store::groups`].

use tauri::State;

use crate::models::{Group, GroupInput};
use crate::store::{groups as dao, DbPool};
use crate::AppError;

#[tauri::command]
pub async fn list_groups(pool: State<'_, DbPool>) -> Result<Vec<Group>, AppError> {
    Ok(dao::list(pool.inner()).await?)
}

#[tauri::command]
pub async fn create_group(pool: State<'_, DbPool>, input: GroupInput) -> Result<Group, AppError> {
    Ok(dao::create(pool.inner(), input).await?)
}

#[tauri::command]
pub async fn update_group(
    pool: State<'_, DbPool>,
    id: String,
    input: GroupInput,
) -> Result<Group, AppError> {
    Ok(dao::update(pool.inner(), &id, input).await?)
}

#[tauri::command]
pub async fn delete_group(pool: State<'_, DbPool>, id: String) -> Result<bool, AppError> {
    Ok(dao::delete(pool.inner(), &id).await?)
}

/// Move a host into a group, or detach by passing `null`.
#[tauri::command]
pub async fn move_host_to_group(
    pool: State<'_, DbPool>,
    host_id: String,
    group_id: Option<String>,
) -> Result<(), AppError> {
    dao::move_host(pool.inner(), &host_id, group_id.as_deref()).await?;
    Ok(())
}
