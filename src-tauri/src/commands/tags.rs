//! `tags_*` Tauri commands. Thin wrappers over [`crate::store::tags`].

use tauri::State;

use crate::models::{HostTagLink, Tag, TagInput};
use crate::store::{tags as dao, DbPool};
use crate::AppError;

#[tauri::command]
pub async fn list_tags(pool: State<'_, DbPool>) -> Result<Vec<Tag>, AppError> {
    Ok(dao::list(pool.inner()).await?)
}

#[tauri::command]
pub async fn create_tag(pool: State<'_, DbPool>, input: TagInput) -> Result<Tag, AppError> {
    Ok(dao::create(pool.inner(), input).await?)
}

#[tauri::command]
pub async fn update_tag(
    pool: State<'_, DbPool>,
    id: String,
    input: TagInput,
) -> Result<Tag, AppError> {
    Ok(dao::update(pool.inner(), &id, input).await?)
}

#[tauri::command]
pub async fn delete_tag(pool: State<'_, DbPool>, id: String) -> Result<bool, AppError> {
    Ok(dao::delete(pool.inner(), &id).await?)
}

#[tauri::command]
pub async fn set_host_tags(
    pool: State<'_, DbPool>,
    host_id: String,
    tag_ids: Vec<String>,
) -> Result<(), AppError> {
    dao::set_host_tags(pool.inner(), &host_id, &tag_ids).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_host_tag_links(pool: State<'_, DbPool>) -> Result<Vec<HostTagLink>, AppError> {
    Ok(dao::list_host_tag_links(pool.inner()).await?)
}
