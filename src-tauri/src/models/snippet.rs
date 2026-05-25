use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A reusable command (or sequence) the user can fire into a terminal.
///
/// `content` may include `{{variable}}` placeholders. Built-in variables —
/// `{{host}}`, `{{user}}`, `{{date}}` — are substituted automatically; any
/// other `{{custom}}` triggers a prompt in the UI before insertion.
#[derive(Debug, Clone, Serialize, Deserialize, TS, sqlx::FromRow)]
#[ts(export, export_to = "../../src/lib/bindings/Snippet.ts")]
pub struct Snippet {
    pub id: String,
    pub name: String,
    pub content: String,
    /// Optional folder label used to group snippets in the palette.
    pub folder: Option<String>,
    /// Comma-separated free-form tags (lowercase, trimmed).
    pub tags_csv: String,
    /// JSON array of `{ name, default? }` describing custom variables. May be `"[]"`.
    pub variables_schema_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/bindings/SnippetInput.ts")]
pub struct SnippetInput {
    pub name: String,
    pub content: String,
    pub folder: Option<String>,
    pub tags_csv: String,
    pub variables_schema_json: String,
}
