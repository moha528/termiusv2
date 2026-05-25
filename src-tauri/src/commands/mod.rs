//! Tauri command handlers exposed to the frontend via `invoke`.
//!
//! One sub-module per domain; each re-exports its `#[tauri::command]` fns.

pub mod command_history;
pub mod edit;
pub mod fs_local;
pub mod groups;
pub mod hosts;
pub mod identities;
pub mod import;
pub mod keyvault;
pub mod known_hosts;
pub mod local_pty;
pub mod port_forwards;
pub mod sessions;
pub mod settings;
pub mod sftp;
pub mod snippets;
pub mod ssh_keys;
pub mod sync_git;
pub mod tags;
pub mod vault;
pub mod vault_export;
