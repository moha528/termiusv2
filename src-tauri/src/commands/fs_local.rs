//! Local filesystem commands used by the SFTP dual-pane (left side).
//!
//! These mirror the shape of the SFTP commands so the front-end can drive
//! both panels with the same `FileEntry` model and the same actions
//! (navigation, mkdir, remove, rename).

use std::path::{Path, PathBuf};
use std::time::SystemTime;

use chrono::{DateTime, Utc};

use crate::models::FileEntry;
use crate::AppError;

/// Default starting directory for the local pane: the user's home, or `/`.
#[tauri::command]
pub fn local_home_dir() -> Result<String, AppError> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/"));
    Ok(home.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn local_list_dir(path: String) -> Result<Vec<FileEntry>, AppError> {
    let path = Path::new(&path);
    let mut entries = Vec::new();
    let read = std::fs::read_dir(path).map_err(|e| AppError(anyhow::anyhow!(e)))?;
    for raw in read {
        let raw = raw.map_err(|e| AppError(anyhow::anyhow!(e)))?;
        // We use `symlink_metadata` so the entry reflects the symlink itself
        // rather than its target — matches what the SFTP side reports.
        let meta = match raw.metadata() {
            Ok(m) => m,
            Err(_) => continue, // dangling symlink, permission denied; skip
        };
        let file_type = raw.file_type().ok();
        let is_symlink = file_type.is_some_and(|t| t.is_symlink());
        let is_dir = meta.is_dir();
        let size = if meta.is_file() {
            Some(meta.len())
        } else {
            None
        };
        let mtime = meta.modified().ok().and_then(systemtime_to_rfc3339);
        let permissions = local_perms(&meta);

        entries.push(FileEntry {
            name: raw.file_name().to_string_lossy().into_owned(),
            is_dir,
            is_symlink,
            size,
            mtime,
            permissions,
        });
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
pub fn local_mkdir(path: String) -> Result<(), AppError> {
    std::fs::create_dir(&path).map_err(|e| AppError(anyhow::anyhow!(e)))?;
    Ok(())
}

/// Create an empty file. Errors out if the path already exists so we don't
/// accidentally truncate something.
#[tauri::command]
pub fn local_create_file(path: String) -> Result<(), AppError> {
    let p = Path::new(&path);
    if p.exists() {
        return Err(AppError(anyhow::anyhow!("{} already exists", path)));
    }
    std::fs::File::create(p).map_err(|e| AppError(anyhow::anyhow!(e)))?;
    Ok(())
}

#[tauri::command]
pub fn local_remove(path: String) -> Result<(), AppError> {
    let p = Path::new(&path);
    let meta = std::fs::symlink_metadata(p).map_err(|e| AppError(anyhow::anyhow!(e)))?;
    if meta.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| AppError(anyhow::anyhow!(e)))?;
    } else {
        std::fs::remove_file(p).map_err(|e| AppError(anyhow::anyhow!(e)))?;
    }
    Ok(())
}

#[tauri::command]
pub fn local_rename(from: String, to: String) -> Result<(), AppError> {
    std::fs::rename(&from, &to).map_err(|e| AppError(anyhow::anyhow!(e)))?;
    Ok(())
}

fn systemtime_to_rfc3339(t: SystemTime) -> Option<String> {
    let dt: DateTime<Utc> = t.into();
    Some(dt.to_rfc3339())
}

#[cfg(unix)]
fn local_perms(meta: &std::fs::Metadata) -> Option<u32> {
    use std::os::unix::fs::PermissionsExt;
    Some(meta.permissions().mode() & 0o7777)
}

#[cfg(not(unix))]
fn local_perms(_meta: &std::fs::Metadata) -> Option<u32> {
    None
}
