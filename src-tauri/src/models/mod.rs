//! Types partagés exposés au front via Tauri IPC.
//!
//! Tous les types ici dérivent `ts_rs::TS` pour générer leurs équivalents
//! TypeScript dans `../../src/lib/bindings/` (voir `cargo test`).

pub mod file_entry;
pub mod group;
pub mod host;

pub use file_entry::FileEntry;
pub use group::{Group, GroupInput};
pub use host::{Host, HostInput};
