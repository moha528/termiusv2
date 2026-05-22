//! Tauri command handlers exposed to the frontend via `invoke`.
//!
//! One sub-module per domain; each re-exports its `#[tauri::command]` fns.

pub mod fs_local;
pub mod hosts;
pub mod import;
pub mod keyvault;
pub mod sessions;
pub mod settings;
pub mod sftp;
