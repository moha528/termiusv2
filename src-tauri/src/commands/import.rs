//! Tauri commands for importing hosts from external sources.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use crate::import::ssh_config::{self, SshConfigEntry};
use crate::models::Host;
use crate::store::{hosts as hosts_dao, DbPool};
use crate::AppError;

/// Default location of the user's OpenSSH config file.
fn default_ssh_config_path() -> Option<PathBuf> {
    dirs_home().map(|h| h.join(".ssh").join("config"))
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

/// Result of an import preview: the parsed entries paired with whether a host
/// with the same label already exists in the database (so the UI can warn).
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/lib/bindings/SshConfigImport.ts")]
pub struct SshConfigImport {
    pub path: String,
    pub entries: Vec<SshConfigImportEntry>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/lib/bindings/SshConfigImportEntry.ts")]
pub struct SshConfigImportEntry {
    #[serde(flatten)]
    pub entry: SshConfigEntry,
    /// True iff a host with the same label already exists.
    pub duplicate: bool,
}

#[tauri::command]
pub async fn read_ssh_config(pool: State<'_, DbPool>) -> Result<SshConfigImport, AppError> {
    let path = default_ssh_config_path()
        .ok_or_else(|| AppError(anyhow::anyhow!("could not resolve home directory")))?;
    read_ssh_config_at(pool, path.to_string_lossy().into_owned()).await
}

#[tauri::command]
pub async fn read_ssh_config_at(
    pool: State<'_, DbPool>,
    path: String,
) -> Result<SshConfigImport, AppError> {
    let p = Path::new(&path);
    let parsed = if p.exists() {
        ssh_config::parse(p)?
    } else {
        Vec::new()
    };

    let existing = hosts_dao::list(pool.inner()).await?;
    let known_labels: std::collections::HashSet<_> =
        existing.iter().map(|h| h.label.clone()).collect();

    let entries = parsed
        .into_iter()
        .map(|entry| {
            let duplicate = known_labels.contains(&entry.alias);
            SshConfigImportEntry { entry, duplicate }
        })
        .collect();

    Ok(SshConfigImport { path, entries })
}

/// Import a subset of parsed entries into the hosts table.
///
/// The `aliases` list selects which entries from the user's `~/.ssh/config`
/// to actually create. Entries whose label already exists are silently
/// skipped (the caller is expected to have surfaced the conflict in the UI).
///
/// Returns the freshly inserted hosts so the front can refresh its store.
#[tauri::command]
pub async fn import_ssh_config(
    pool: State<'_, DbPool>,
    aliases: Vec<String>,
) -> Result<Vec<Host>, AppError> {
    let path = default_ssh_config_path()
        .ok_or_else(|| AppError(anyhow::anyhow!("could not resolve home directory")))?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let parsed = ssh_config::parse(&path)?;
    let existing = hosts_dao::list(pool.inner()).await?;
    let known_labels: std::collections::HashSet<_> =
        existing.iter().map(|h| h.label.clone()).collect();

    let mut created = Vec::new();
    for entry in parsed {
        if !aliases.contains(&entry.alias) {
            continue;
        }
        if known_labels.contains(&entry.alias) {
            continue;
        }
        let Some(hostname) = entry.hostname.clone() else {
            // Skip aliases that resolve to nothing — they would be unusable.
            continue;
        };
        let input = crate::models::HostInput {
            label: entry.alias.clone(),
            hostname,
            port: entry.port.unwrap_or(22) as i32,
            username: entry.user.unwrap_or_else(default_username),
            group_id: None,
            proxy_jump_host_id: None,
            identity_id: None,
            agent_forward: false,
            log_to_file: false,
            pre_connect_script: String::new(),
            post_connect_script: String::new(),
        };
        let host = hosts_dao::create(pool.inner(), input).await?;
        created.push(host);
    }
    Ok(created)
}

fn default_username() -> String {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "root".into())
}
