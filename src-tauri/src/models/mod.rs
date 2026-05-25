//! Types partagés exposés au front via Tauri IPC.
//!
//! Tous les types ici dérivent `ts_rs::TS` pour générer leurs équivalents
//! TypeScript dans `../../src/lib/bindings/` (voir `cargo test`).

pub mod command_history;
pub mod file_entry;
pub mod group;
pub mod host;
pub mod identity;
pub mod known_host;
pub mod port_forward;
pub mod snippet;
pub mod ssh_key;
pub mod sync_state;
pub mod tag;

pub use command_history::CommandHistoryEntry;
pub use file_entry::FileEntry;
pub use group::{Group, GroupInput};
pub use host::{Host, HostInput};
pub use identity::{Identity, IdentityInput, IdentityKeyLink};
pub use known_host::KnownHost;
pub use port_forward::{ForwardType, PortForward, PortForwardInput};
pub use snippet::{Snippet, SnippetInput};
pub use ssh_key::{SshKey, SshKeyAlgorithm};
pub use sync_state::{SyncConfigInput, SyncResult, SyncState};
pub use tag::{HostTagLink, Tag, TagInput};
