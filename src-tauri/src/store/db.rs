use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;

pub type DbPool = SqlitePool;

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

/// Open (and lazily create) the SQLite database at `db_path`, run pending
/// migrations and return a connection pool.
///
/// The parent directory of `db_path` is created if it does not exist.
pub async fn init_pool(db_path: &Path) -> Result<DbPool> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("failed to create data dir {}", parent.display()))?;
    }

    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .with_context(|| format!("failed to open sqlite db at {}", db_path.display()))?;

    MIGRATOR
        .run(&pool)
        .await
        .context("failed to run sqlx migrations")?;

    Ok(pool)
}

/// Resolve the production database path inside the Tauri app data directory.
pub fn default_db_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("termiusv2.sqlite")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `init_pool` should create the file, apply migrations and expose both
    /// `hosts` and `groups` tables.
    #[tokio::test]
    async fn init_pool_creates_schema() {
        let tmp = tempfile::tempdir().expect("tmp");
        let db_path = tmp.path().join("test.sqlite");
        let pool = init_pool(&db_path).await.expect("init pool");

        // Both tables must exist.
        let tables: Vec<(String,)> =
            sqlx::query_as("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                .fetch_all(&pool)
                .await
                .expect("fetch tables");
        let names: Vec<String> = tables.into_iter().map(|(n,)| n).collect();
        assert!(names.contains(&"hosts".to_string()), "hosts table missing");
        assert!(
            names.contains(&"groups".to_string()),
            "groups table missing"
        );
    }
}
