use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../src/lib/bindings/ForwardType.ts")]
pub enum ForwardType {
    Local,
    Remote,
    Dynamic,
}

impl ForwardType {
    pub fn as_str(self) -> &'static str {
        match self {
            ForwardType::Local => "local",
            ForwardType::Remote => "remote",
            ForwardType::Dynamic => "dynamic",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "local" => Some(ForwardType::Local),
            "remote" => Some(ForwardType::Remote),
            "dynamic" => Some(ForwardType::Dynamic),
            _ => None,
        }
    }
}

/// A persisted port-forward definition. The runtime state (whether the
/// listener is currently active) lives outside the DB in `ForwardRegistry`.
#[derive(Debug, Clone, Serialize, Deserialize, TS, sqlx::FromRow)]
#[ts(export, export_to = "../../src/lib/bindings/PortForward.ts")]
pub struct PortForward {
    pub id: String,
    pub host_id: String,
    /// Stored as a String so sqlx can hydrate the row; convert via
    /// [`ForwardType::parse`] when needed.
    pub forward_type: String,
    pub label: String,
    pub local_port: i32,
    pub remote_host: String,
    pub remote_port: i32,
    pub auto_start: bool,
    pub created_at: String,
}

/// Payload for creating or updating a [`PortForward`].
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/bindings/PortForwardInput.ts")]
pub struct PortForwardInput {
    pub host_id: String,
    pub forward_type: ForwardType,
    pub label: String,
    pub local_port: i32,
    pub remote_host: String,
    pub remote_port: i32,
    pub auto_start: bool,
}
