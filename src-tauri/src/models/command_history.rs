use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// One command sent through a terminal session. `host_id` is `None` for
/// local-terminal sessions (no remote target).
#[derive(Debug, Clone, Serialize, Deserialize, TS, sqlx::FromRow)]
#[ts(export, export_to = "../../src/lib/bindings/CommandHistoryEntry.ts")]
pub struct CommandHistoryEntry {
    pub id: i64,
    pub host_id: Option<String>,
    pub command: String,
    pub used_at: String,
}
