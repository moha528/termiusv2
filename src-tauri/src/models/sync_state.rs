use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Configuration et état runtime de la sync Git (P5-T03 → T05).
///
/// `auth_method` accepte :
///   - `"none"` : URL publique
///   - `"https-pat"` : Personal Access Token stocké dans le keychain OS
///   - `"ssh"` : utilise la config SSH du système (clé par défaut, agent)
///
/// Tous les champs `last_*` sont du best-effort : si le push échoue, on
/// stocke `last_error` mais on ne perd pas la config.
#[derive(Debug, Clone, Serialize, Deserialize, TS, sqlx::FromRow)]
#[ts(export, export_to = "../../src/lib/bindings/SyncState.ts")]
pub struct SyncState {
    pub repo_url: String,
    pub branch: String,
    pub auth_method: String,
    pub enabled: bool,
    pub last_remote_sha: Option<String>,
    pub last_pushed_at: Option<String>,
    pub last_pulled_at: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/bindings/SyncConfigInput.ts")]
pub struct SyncConfigInput {
    pub repo_url: String,
    pub branch: String,
    pub auth_method: String,
    pub enabled: bool,
}

/// Résultat compact d'un push ou pull, pour feedback côté front.
#[derive(Debug, Clone, Serialize, Deserialize, TS, Default)]
#[ts(export, export_to = "../../src/lib/bindings/SyncResult.ts")]
pub struct SyncResult {
    /// Sha du commit local après l'opération (push) ou du remote après pull.
    pub head_sha: Option<String>,
    /// `true` si le vault distant a vraiment changé par rapport à la
    /// dernière opération.
    pub changed: bool,
    /// Message court lisible côté UI.
    pub summary: String,
}
