use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A remote SSH endpoint persisted in the local database.
#[derive(Debug, Clone, Serialize, Deserialize, TS, sqlx::FromRow)]
#[ts(export, export_to = "../src/lib/bindings/Host.ts")]
pub struct Host {
    pub id: String,
    pub label: String,
    pub hostname: String,
    pub port: i32,
    pub username: String,
    pub group_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Payload for creating or updating a [`Host`]. `id` is server-generated on create.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/lib/bindings/HostInput.ts")]
pub struct HostInput {
    pub label: String,
    pub hostname: String,
    pub port: i32,
    pub username: String,
    pub group_id: Option<String>,
}
