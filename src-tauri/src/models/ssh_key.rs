use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Metadata about an SSH key stored in this app. The actual private key file
/// lives on disk (`private_key_path`); its optional passphrase is stored in
/// the OS keychain (`ssh-key-{id}`).
#[derive(Debug, Clone, Serialize, Deserialize, TS, sqlx::FromRow)]
#[ts(export, export_to = "../../src/lib/bindings/SshKey.ts")]
pub struct SshKey {
    pub id: String,
    pub name: String,
    /// "ed25519", "rsa-3072", "rsa-4096", "ecdsa-256", ...
    pub key_type: String,
    /// OpenSSH-format public key (single-line, e.g. `ssh-ed25519 AAA... user@host`).
    pub public_key: String,
    /// SHA-256 fingerprint formatted `SHA256:<base64>`.
    pub fingerprint: String,
    pub private_key_path: String,
    pub has_passphrase: bool,
    pub created_at: String,
}

/// Algorithms exposed to the front for the "generate key" form.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../src/lib/bindings/SshKeyAlgorithm.ts")]
pub enum SshKeyAlgorithm {
    Ed25519,
    Rsa4096,
}
