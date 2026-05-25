use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A remote SSH endpoint persisted in the local database.
#[derive(Debug, Clone, Serialize, Deserialize, TS, sqlx::FromRow)]
#[ts(export, export_to = "../../src/lib/bindings/Host.ts")]
pub struct Host {
    pub id: String,
    pub label: String,
    pub hostname: String,
    pub port: i32,
    pub username: String,
    pub group_id: Option<String>,
    /// When set, the connection is tunneled through this other host (ProxyJump).
    pub proxy_jump_host_id: Option<String>,
    /// When set, runtime SSH params (username, agent forward, keys) come
    /// from this identity instead of the host's own fields (P4-T05).
    pub identity_id: Option<String>,
    /// Request SSH agent forwarding on the PTY channel (P3-T14).
    pub agent_forward: bool,
    /// Tee the PTY byte stream to a local log file (P3-T15).
    pub log_to_file: bool,
    /// Local script executed before opening the SSH session (P4-T06). May
    /// be empty. Each non-empty line is passed to the OS shell.
    pub pre_connect_script: String,
    /// Lines pushed into the remote PTY right after the shell is ready
    /// (P4-T06). May be empty. A trailing newline is appended so the last
    /// line is actually executed.
    pub post_connect_script: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Payload for creating or updating a [`Host`]. `id` is server-generated on create.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/bindings/HostInput.ts")]
pub struct HostInput {
    pub label: String,
    pub hostname: String,
    pub port: i32,
    pub username: String,
    pub group_id: Option<String>,
    pub proxy_jump_host_id: Option<String>,
    pub identity_id: Option<String>,
    pub agent_forward: bool,
    pub log_to_file: bool,
    pub pre_connect_script: String,
    pub post_connect_script: String,
}
