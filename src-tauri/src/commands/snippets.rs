//! Tauri commands: snippets CRUD + variable utilities (P4-T01).

use std::collections::HashMap;

use tauri::State;

use crate::models::{Snippet, SnippetInput};
use crate::snippets as snip;
use crate::store::{snippets as dao, DbPool};
use crate::AppError;

#[tauri::command]
pub async fn list_snippets(pool: State<'_, DbPool>) -> Result<Vec<Snippet>, AppError> {
    Ok(dao::list(pool.inner()).await?)
}

#[tauri::command]
pub async fn create_snippet(
    pool: State<'_, DbPool>,
    input: SnippetInput,
) -> Result<Snippet, AppError> {
    Ok(dao::create(pool.inner(), input).await?)
}

#[tauri::command]
pub async fn update_snippet(
    pool: State<'_, DbPool>,
    id: String,
    input: SnippetInput,
) -> Result<Snippet, AppError> {
    Ok(dao::update(pool.inner(), &id, input).await?)
}

#[tauri::command]
pub async fn delete_snippet(pool: State<'_, DbPool>, id: String) -> Result<bool, AppError> {
    Ok(dao::delete(pool.inner(), &id).await?)
}

/// Return the list of `{{var}}` placeholders found in `content`, in order
/// of first occurrence. The front uses this to build the prompt modal
/// without having to re-implement the parser.
#[tauri::command]
pub fn extract_snippet_variables(content: String) -> Vec<String> {
    snip::extract_variables(&content)
}

/// Substitute placeholders in `content` with `values` and return the
/// rendered string ready to send to a terminal.
#[tauri::command]
pub fn render_snippet(content: String, values: HashMap<String, String>) -> String {
    snip::substitute(&content, &values)
}
