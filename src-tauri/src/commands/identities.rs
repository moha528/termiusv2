//! Tauri commands for identities (P4-T05).

use tauri::State;

use crate::models::{Identity, IdentityInput, IdentityKeyLink};
use crate::store::{identities as dao, DbPool};
use crate::AppError;

#[tauri::command]
pub async fn list_identities(pool: State<'_, DbPool>) -> Result<Vec<Identity>, AppError> {
    Ok(dao::list(pool.inner()).await?)
}

#[tauri::command]
pub async fn create_identity(
    pool: State<'_, DbPool>,
    input: IdentityInput,
) -> Result<Identity, AppError> {
    Ok(dao::create(pool.inner(), input).await?)
}

#[tauri::command]
pub async fn update_identity(
    pool: State<'_, DbPool>,
    id: String,
    input: IdentityInput,
) -> Result<Identity, AppError> {
    Ok(dao::update(pool.inner(), &id, input).await?)
}

#[tauri::command]
pub async fn delete_identity(pool: State<'_, DbPool>, id: String) -> Result<bool, AppError> {
    Ok(dao::delete(pool.inner(), &id).await?)
}

#[tauri::command]
pub async fn set_identity_keys(
    pool: State<'_, DbPool>,
    identity_id: String,
    key_ids: Vec<String>,
) -> Result<(), AppError> {
    dao::set_identity_keys(pool.inner(), &identity_id, &key_ids).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_identity_key_links(
    pool: State<'_, DbPool>,
) -> Result<Vec<IdentityKeyLink>, AppError> {
    Ok(dao::list_links(pool.inner()).await?)
}
