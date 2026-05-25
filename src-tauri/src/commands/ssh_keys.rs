//! `ssh_keys_*` Tauri commands. Glue between the front-end Keys settings
//! page and the on-disk keystore + DB row.

use std::path::PathBuf;

use tauri::{AppHandle, Manager, State};

use crate::models::{SshKey, SshKeyAlgorithm};
use crate::ssh_keys;
use crate::store::{ssh_keys as dao, DbPool};
use crate::AppError;

fn keystore(app: &AppHandle) -> Result<PathBuf, AppError> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError(anyhow::anyhow!("resolve app data dir: {e}")))?;
    ssh_keys::keystore_dir(&app_data).map_err(AppError)
}

#[tauri::command]
pub async fn list_ssh_keys(pool: State<'_, DbPool>) -> Result<Vec<SshKey>, AppError> {
    Ok(dao::list(pool.inner()).await?)
}

#[tauri::command]
pub async fn generate_ssh_key(
    app: AppHandle,
    pool: State<'_, DbPool>,
    name: String,
    algorithm: SshKeyAlgorithm,
    passphrase: Option<String>,
) -> Result<SshKey, AppError> {
    let dir = keystore(&app)?;
    let key =
        ssh_keys::generate(&dir, &name, algorithm, passphrase.as_deref()).map_err(AppError)?;
    dao::insert(pool.inner(), &key).await?;
    // Reload from DB so created_at reflects the actual timestamp.
    Ok(dao::get(pool.inner(), &key.id).await?)
}

#[tauri::command]
pub async fn import_ssh_key(
    app: AppHandle,
    pool: State<'_, DbPool>,
    file_path: String,
    name: String,
    passphrase: Option<String>,
) -> Result<SshKey, AppError> {
    let dir = keystore(&app)?;
    let src = PathBuf::from(&file_path);
    let key = ssh_keys::import(&dir, &src, &name, passphrase.as_deref()).map_err(AppError)?;
    dao::insert(pool.inner(), &key).await?;
    Ok(dao::get(pool.inner(), &key.id).await?)
}

#[tauri::command]
pub async fn delete_ssh_key(pool: State<'_, DbPool>, id: String) -> Result<bool, AppError> {
    let key = match dao::get(pool.inner(), &id).await {
        Ok(k) => k,
        Err(_) => return Ok(false),
    };
    let removed = dao::delete(pool.inner(), &id).await?;
    if removed {
        // Best-effort cleanup of the on-disk files + keychain entry; we don't
        // fail the command if a file is already gone.
        if let Err(e) = ssh_keys::delete_files(&key) {
            tracing::warn!("ssh key cleanup {id}: {e}");
        }
    }
    Ok(removed)
}

#[tauri::command]
pub async fn list_host_key_links(
    pool: State<'_, DbPool>,
) -> Result<Vec<crate::store::ssh_keys::HostKeyLink>, AppError> {
    Ok(dao::list_host_key_links(pool.inner()).await?)
}

#[tauri::command]
pub async fn set_host_keys(
    pool: State<'_, DbPool>,
    host_id: String,
    key_ids: Vec<String>,
) -> Result<(), AppError> {
    dao::set_host_keys(pool.inner(), &host_id, &key_ids).await?;
    Ok(())
}
