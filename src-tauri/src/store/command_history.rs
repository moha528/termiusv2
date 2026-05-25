//! DAO for the `command_history` table (P4-T03).
//!
//! The capture path lives in `commands::sessions::send_terminal_input` and
//! `commands::local_pty::local_send_input`: each newline-terminated stdin
//! chunk is split into commands and pushed here via [`record`].

use anyhow::{Context, Result};

use crate::models::CommandHistoryEntry;

use super::DbPool;

/// Insert a single command. Empty / whitespace-only commands are ignored
/// silently so the caller doesn't have to filter.
pub async fn record(pool: &DbPool, host_id: Option<&str>, command: &str) -> Result<()> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    sqlx::query("INSERT INTO command_history (host_id, command) VALUES (?1, ?2)")
        .bind(host_id)
        .bind(trimmed)
        .execute(pool)
        .await
        .context("record command_history")?;
    Ok(())
}

/// Return the most recent entries, deduplicated by command text. `scope_host`
/// = `Some(id)` keeps entries from this host *and* global (NULL); `None`
/// returns every entry (useful for a "search all" mode).
pub async fn recent(
    pool: &DbPool,
    scope_host: Option<&str>,
    limit: i64,
) -> Result<Vec<CommandHistoryEntry>> {
    let sql = match scope_host {
        Some(_) => {
            "SELECT id, host_id, command, used_at
             FROM command_history
             WHERE host_id = ?1 OR host_id IS NULL
             GROUP BY command
             ORDER BY MAX(used_at) DESC, MAX(id) DESC
             LIMIT ?2"
        }
        None => {
            "SELECT id, host_id, command, used_at
             FROM command_history
             GROUP BY command
             ORDER BY MAX(used_at) DESC, MAX(id) DESC
             LIMIT ?1"
        }
    };
    let q = sqlx::query_as::<_, CommandHistoryEntry>(sql);
    let q = match scope_host {
        Some(id) => q.bind(id).bind(limit),
        None => q.bind(limit),
    };
    q.fetch_all(pool).await.context("recent commands")
}

/// Hard-clear every entry (global) or only those of one host.
pub async fn clear(pool: &DbPool, scope_host: Option<&str>) -> Result<u64> {
    let res = match scope_host {
        Some(id) => sqlx::query("DELETE FROM command_history WHERE host_id = ?1")
            .bind(id)
            .execute(pool)
            .await
            .context("clear host history")?,
        None => sqlx::query("DELETE FROM command_history")
            .execute(pool)
            .await
            .context("clear all history")?,
    };
    Ok(res.rows_affected())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::HostInput;
    use crate::store::{hosts as hosts_dao, init_pool};

    async fn fresh_pool() -> DbPool {
        let tmp = tempfile::Builder::new()
            .suffix(".sqlite")
            .tempfile()
            .expect("tmp");
        let path = tmp.path().to_path_buf();
        drop(tmp);
        init_pool(&path).await.expect("pool")
    }

    fn host(label: &str) -> HostInput {
        HostInput {
            label: label.into(),
            hostname: "h".into(),
            port: 22,
            username: "u".into(),
            group_id: None,
            proxy_jump_host_id: None,
            identity_id: None,
            agent_forward: false,
            log_to_file: false,
            pre_connect_script: String::new(),
            post_connect_script: String::new(),
        }
    }

    #[tokio::test]
    async fn empty_command_skipped() {
        let pool = fresh_pool().await;
        record(&pool, None, "   ").await.unwrap();
        record(&pool, None, "").await.unwrap();
        assert!(recent(&pool, None, 10).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn dedup_keeps_latest_per_command() {
        let pool = fresh_pool().await;
        record(&pool, None, "ls").await.unwrap();
        record(&pool, None, "pwd").await.unwrap();
        record(&pool, None, "ls").await.unwrap();
        let r = recent(&pool, None, 10).await.unwrap();
        assert_eq!(r.len(), 2);
        // Most recent first → "ls" (re-recorded) before "pwd".
        assert_eq!(r[0].command, "ls");
        assert_eq!(r[1].command, "pwd");
    }

    #[tokio::test]
    async fn host_scope_includes_global() {
        let pool = fresh_pool().await;
        let h = hosts_dao::create(&pool, host("h")).await.unwrap();
        let other = hosts_dao::create(&pool, host("other")).await.unwrap();
        record(&pool, Some(&h.id), "host-cmd").await.unwrap();
        record(&pool, None, "global-cmd").await.unwrap();
        record(&pool, Some(&other.id), "other-cmd").await.unwrap();
        let r = recent(&pool, Some(&h.id), 10).await.unwrap();
        let cmds: Vec<&str> = r.iter().map(|e| e.command.as_str()).collect();
        assert!(cmds.contains(&"host-cmd"));
        assert!(cmds.contains(&"global-cmd"));
        assert!(!cmds.contains(&"other-cmd"));
    }

    #[tokio::test]
    async fn clear_scoped() {
        let pool = fresh_pool().await;
        let h = hosts_dao::create(&pool, host("h")).await.unwrap();
        record(&pool, Some(&h.id), "a").await.unwrap();
        record(&pool, None, "b").await.unwrap();
        let removed = clear(&pool, Some(&h.id)).await.unwrap();
        assert_eq!(removed, 1);
        let left = recent(&pool, None, 10).await.unwrap();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].command, "b");
    }
}
