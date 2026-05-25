//! Tauri commands : export & import chiffré du vault (P5-T01, P5-T02).

use std::path::PathBuf;

use tauri::State;

use crate::store::DbPool;
use crate::vault_export::{
    self as vex, ImportMode, ImportStats,
};
use crate::AppError;

/// Snapshot + chiffrement + écriture sur disque. Renvoie le nombre d'octets
/// écrits pour que la UI puisse confirmer la taille du fichier.
#[tauri::command]
pub async fn export_vault(
    pool: State<'_, DbPool>,
    password: String,
    path: String,
) -> Result<u64, AppError> {
    if password.is_empty() {
        return Err(AppError(anyhow::anyhow!("mot de passe vide")));
    }
    let bundle = vex::snapshot(pool.inner()).await?;
    let bytes = vex::encrypt_bundle(&bundle, &password)
        .map_err(|e| AppError(anyhow::anyhow!("chiffrement : {e}")))?;
    let path_buf = PathBuf::from(&path);
    if let Some(parent) = path_buf.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError(anyhow::anyhow!("create_dir_all {}: {e}", parent.display())))?;
    }
    std::fs::write(&path_buf, &bytes)
        .map_err(|e| AppError(anyhow::anyhow!("write {}: {e}", path_buf.display())))?;
    Ok(bytes.len() as u64)
}

/// Lecture + déchiffrement + application au DB selon le mode demandé.
#[tauri::command]
pub async fn import_vault(
    pool: State<'_, DbPool>,
    password: String,
    path: String,
    mode: String,
) -> Result<ImportStats, AppError> {
    let mode = match mode.as_str() {
        "merge" => ImportMode::Merge,
        "replace" => ImportMode::Replace,
        other => {
            return Err(AppError(anyhow::anyhow!(
                "mode d'import inconnu : {other} (attendu : merge|replace)"
            )))
        }
    };
    let buf = std::fs::read(&path)
        .map_err(|e| AppError(anyhow::anyhow!("read {path}: {e}")))?;
    let bundle = vex::decrypt_bundle(&buf, &password)
        .map_err(|e| AppError(anyhow::anyhow!(e.to_string())))?;
    let stats = vex::apply_bundle(pool.inner(), &bundle, mode)
        .await
        .map_err(|e| AppError(anyhow::anyhow!("apply: {e}")))?;
    Ok(stats)
}
