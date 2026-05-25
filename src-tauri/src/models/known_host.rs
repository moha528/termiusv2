use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// One stored TOFU fingerprint for an (hostname, port) endpoint.
#[derive(Debug, Clone, Serialize, Deserialize, TS, sqlx::FromRow)]
#[ts(export, export_to = "../../src/lib/bindings/KnownHost.ts")]
pub struct KnownHost {
    pub hostname: String,
    pub port: i32,
    pub fingerprint: String,
    pub key_type: String,
    pub accepted_at: String,
}
