use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Reusable SSH connection profile (P4-T05). A host can reference one of
/// these and inherit `username`, `agent_forward`, and the priority-ordered
/// list of keys instead of duplicating them across every entry.
#[derive(Debug, Clone, Serialize, Deserialize, TS, sqlx::FromRow)]
#[ts(export, export_to = "../../src/lib/bindings/Identity.ts")]
pub struct Identity {
    pub id: String,
    pub name: String,
    pub username: String,
    pub agent_forward: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/bindings/IdentityInput.ts")]
pub struct IdentityInput {
    pub name: String,
    pub username: String,
    pub agent_forward: bool,
}

/// `(identity_id, key_id, priority)` join row, returned by the front so it
/// can render and reorder the key list without an extra query.
#[derive(Debug, Clone, Serialize, Deserialize, TS, sqlx::FromRow)]
#[ts(export, export_to = "../../src/lib/bindings/IdentityKeyLink.ts")]
pub struct IdentityKeyLink {
    pub identity_id: String,
    pub key_id: String,
    pub priority: i32,
}
