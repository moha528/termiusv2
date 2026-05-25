use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A colored label that can be attached to multiple hosts.
#[derive(Debug, Clone, Serialize, Deserialize, TS, sqlx::FromRow)]
#[ts(export, export_to = "../../src/lib/bindings/Tag.ts")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
    pub created_at: String,
}

/// Payload for creating or renaming a [`Tag`].
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/bindings/TagInput.ts")]
pub struct TagInput {
    pub name: String,
    pub color: String,
}

/// (host_id, tag_id) pair returned by the join query so the UI can build the
/// host → tags map without re-querying per host.
#[derive(Debug, Clone, Serialize, Deserialize, TS, sqlx::FromRow)]
#[ts(export, export_to = "../../src/lib/bindings/HostTagLink.ts")]
pub struct HostTagLink {
    pub host_id: String,
    pub tag_id: String,
}
