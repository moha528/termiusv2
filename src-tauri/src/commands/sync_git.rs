//! Tauri commands : sync Git (P5-T03 → T05).

use tauri::{AppHandle, Manager, State};

use crate::models::{SyncConfigInput, SyncResult, SyncState};
use crate::store::{sync_state as sync_dao, DbPool};
use crate::sync_git as git;
use crate::AppError;

#[tauri::command]
pub async fn sync_get_state(pool: State<'_, DbPool>) -> Result<Option<SyncState>, AppError> {
    Ok(sync_dao::get(pool.inner()).await?)
}

/// Vérifie la connexion sans rien persister. Si `pat` est non-vide, on
/// l'utilise pour ce test seulement — on ne le sauve qu'après confirmation
/// utilisateur via `sync_configure`.
#[tauri::command]
pub async fn sync_test_connection(
    input: SyncConfigInput,
    pat: Option<String>,
) -> Result<(), AppError> {
    // Si un PAT a été fourni pour le test, on le pousse temporairement dans
    // le keychain pour que `build_authed_url` le récupère, puis on le
    // restaure (ou supprime) après le test pour ne pas laisser un token
    // de test qui ne correspond pas à la conf "active".
    let previous = git::load_pat().ok().flatten();
    let temporary_set = if input.auth_method == "https-pat" {
        if let Some(p) = pat.as_deref() {
            if !p.is_empty() {
                git::store_pat(p).map_err(AppError::from)?;
                true
            } else {
                false
            }
        } else {
            false
        }
    } else {
        false
    };

    let result = git::test_connection(&input).await;

    if temporary_set {
        match previous {
            Some(p) => {
                let _ = git::store_pat(&p);
            }
            None => {
                let _ = git::store_pat("");
            }
        }
    }
    result.map_err(AppError::from)
}

/// Enregistre la config et le PAT (si fourni). Si `pat` est `Some("")`,
/// supprime l'entrée keychain existante.
#[tauri::command]
pub async fn sync_configure(
    pool: State<'_, DbPool>,
    input: SyncConfigInput,
    pat: Option<String>,
) -> Result<SyncState, AppError> {
    if let Some(p) = pat {
        git::store_pat(&p).map_err(AppError::from)?;
    }
    Ok(sync_dao::upsert(pool.inner(), input).await?)
}

#[tauri::command]
pub async fn sync_disable(pool: State<'_, DbPool>) -> Result<(), AppError> {
    sync_dao::disable(pool.inner()).await?;
    // On garde le PAT dans le keychain : si l'utilisateur réactive la sync
    // dans la foulée il ne re-tape pas son token. C'est explicitement
    // supprimé via `sync_forget_pat`.
    Ok(())
}

#[tauri::command]
pub async fn sync_forget_pat() -> Result<(), AppError> {
    git::store_pat("").map_err(AppError::from)?;
    Ok(())
}

#[tauri::command]
pub fn sync_set_password(password: String) -> Result<(), AppError> {
    git::store_password(&password).map_err(AppError::from)?;
    Ok(())
}

/// Indique si un password de sync est déjà stocké dans le keychain (la
/// valeur n'est jamais retournée pour ne pas la promener jusqu'au front).
#[tauri::command]
pub fn sync_has_password() -> Result<bool, AppError> {
    Ok(git::load_password()
        .map_err(AppError::from)?
        .filter(|s| !s.is_empty())
        .is_some())
}

#[tauri::command]
pub async fn sync_push_now(
    app: AppHandle,
    pool: State<'_, DbPool>,
) -> Result<SyncResult, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError(anyhow::anyhow!("app_data_dir: {e}")))?;
    let password = git::load_password()
        .map_err(AppError::from)?
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError(anyhow::anyhow!("password de sync non configuré")))?;
    match git::push_now(pool.inner(), &dir, &password).await {
        Ok(r) => Ok(r),
        Err(e) => {
            let _ = sync_dao::set_error(pool.inner(), &e.to_string()).await;
            Err(AppError(e))
        }
    }
}

#[tauri::command]
pub async fn sync_pull_now(
    app: AppHandle,
    pool: State<'_, DbPool>,
) -> Result<SyncResult, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError(anyhow::anyhow!("app_data_dir: {e}")))?;
    let password = git::load_password()
        .map_err(AppError::from)?
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError(anyhow::anyhow!("password de sync non configuré")))?;
    match git::pull_now(pool.inner(), &dir, &password).await {
        Ok(r) => Ok(r),
        Err(e) => {
            let _ = sync_dao::set_error(pool.inner(), &e.to_string()).await;
            Err(AppError(e))
        }
    }
}
