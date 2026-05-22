//! Tauri command handlers exposed to the frontend via `invoke`.
//!
//! One sub-module per domain; each re-exports its `#[tauri::command]` fns.

pub mod hosts;
pub mod keyvault;
pub mod sessions;
pub mod settings;
