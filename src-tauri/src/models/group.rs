use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A folder used to organize hosts in the sidebar. Groups form a tree via `parent_id`.
#[derive(Debug, Clone, Serialize, Deserialize, TS, sqlx::FromRow)]
#[ts(export, export_to = "../src/lib/bindings/Group.ts")]
pub struct Group {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub position: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// Payload for creating or updating a [`Group`].
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/lib/bindings/GroupInput.ts")]
pub struct GroupInput {
    pub name: String,
    pub parent_id: Option<String>,
    pub position: i32,
}
