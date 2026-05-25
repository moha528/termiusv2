//! DAO for the `sync_state` singleton (P5-T03).

use anyhow::{Context, Result};

use crate::models::{SyncConfigInput, SyncState};

use super::DbPool;

const COLS: &str = "repo_url, branch, auth_method, enabled, last_remote_sha,
                    last_pushed_at, last_pulled_at, last_error";

pub async fn get(pool: &DbPool) -> Result<Option<SyncState>> {
    let row = sqlx::query_as::<_, SyncState>(&format!("SELECT {COLS} FROM sync_state WHERE id = 1"))
        .fetch_optional(pool)
        .await
        .context("fetch sync_state")?;
    Ok(row)
}

/// Insert or update the singleton row. The full config is rewritten each
/// time the user changes anything — there's at most one logical row so we
/// can `INSERT OR REPLACE` without worrying about partial updates.
pub async fn upsert(pool: &DbPool, input: SyncConfigInput) -> Result<SyncState> {
    sqlx::query(
        "INSERT INTO sync_state (id, repo_url, branch, auth_method, enabled, updated_at)
         VALUES (1, ?1, ?2, ?3, ?4, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
            repo_url = excluded.repo_url,
            branch = excluded.branch,
            auth_method = excluded.auth_method,
            enabled = excluded.enabled,
            updated_at = datetime('now')",
    )
    .bind(&input.repo_url)
    .bind(&input.branch)
    .bind(&input.auth_method)
    .bind(input.enabled)
    .execute(pool)
    .await
    .context("upsert sync_state")?;
    Ok(get(pool).await?.expect("upserted row missing"))
}

pub async fn set_last_remote_sha(pool: &DbPool, sha: &str) -> Result<()> {
    sqlx::query(
        "UPDATE sync_state SET last_remote_sha = ?1, updated_at = datetime('now') WHERE id = 1",
    )
    .bind(sha)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn set_last_pushed(pool: &DbPool, sha: &str) -> Result<()> {
    sqlx::query(
        "UPDATE sync_state
         SET last_remote_sha = ?1, last_pushed_at = datetime('now'),
             last_error = NULL, updated_at = datetime('now')
         WHERE id = 1",
    )
    .bind(sha)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn set_last_pulled(pool: &DbPool, sha: &str) -> Result<()> {
    sqlx::query(
        "UPDATE sync_state
         SET last_remote_sha = ?1, last_pulled_at = datetime('now'),
             last_error = NULL, updated_at = datetime('now')
         WHERE id = 1",
    )
    .bind(sha)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn set_error(pool: &DbPool, err: &str) -> Result<()> {
    sqlx::query("UPDATE sync_state SET last_error = ?1, updated_at = datetime('now') WHERE id = 1")
        .bind(err)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn disable(pool: &DbPool) -> Result<()> {
    sqlx::query("DELETE FROM sync_state WHERE id = 1")
        .execute(pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::init_pool;

    async fn fresh_pool() -> DbPool {
        let tmp = tempfile::Builder::new()
            .suffix(".sqlite")
            .tempfile()
            .expect("tmp");
        let path = tmp.path().to_path_buf();
        drop(tmp);
        init_pool(&path).await.expect("pool")
    }

    #[tokio::test]
    async fn empty_initially() {
        let pool = fresh_pool().await;
        assert!(get(&pool).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn upsert_and_disable() {
        let pool = fresh_pool().await;
        let state = upsert(
            &pool,
            SyncConfigInput {
                repo_url: "https://github.com/me/vault".into(),
                branch: "main".into(),
                auth_method: "https-pat".into(),
                enabled: true,
            },
        )
        .await
        .unwrap();
        assert_eq!(state.repo_url, "https://github.com/me/vault");
        assert!(state.enabled);

        set_last_pushed(&pool, "abc123").await.unwrap();
        let after_push = get(&pool).await.unwrap().unwrap();
        assert_eq!(after_push.last_remote_sha.as_deref(), Some("abc123"));
        assert!(after_push.last_pushed_at.is_some());

        disable(&pool).await.unwrap();
        assert!(get(&pool).await.unwrap().is_none());
    }
}
