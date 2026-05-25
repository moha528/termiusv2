//! DAO for the `hosts` table.

use anyhow::{Context, Result};
use uuid::Uuid;

use crate::models::{Host, HostInput};

use super::DbPool;

/// Return all hosts, ordered by label (case-insensitive).
pub async fn list(pool: &DbPool) -> Result<Vec<Host>> {
    let rows = sqlx::query_as::<_, Host>(
        "SELECT id, label, hostname, port, username, group_id, proxy_jump_host_id, identity_id,
                agent_forward, log_to_file, pre_connect_script, post_connect_script,
                created_at, updated_at
         FROM hosts
         ORDER BY label COLLATE NOCASE ASC",
    )
    .fetch_all(pool)
    .await
    .context("list hosts")?;
    Ok(rows)
}

/// Insert a new host, generating a fresh UUID v4 as its id.
pub async fn create(pool: &DbPool, input: HostInput) -> Result<Host> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO hosts (id, label, hostname, port, username, group_id, proxy_jump_host_id,
                            identity_id, agent_forward, log_to_file,
                            pre_connect_script, post_connect_script)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
    )
    .bind(&id)
    .bind(&input.label)
    .bind(&input.hostname)
    .bind(input.port)
    .bind(&input.username)
    .bind(&input.group_id)
    .bind(&input.proxy_jump_host_id)
    .bind(&input.identity_id)
    .bind(input.agent_forward)
    .bind(input.log_to_file)
    .bind(&input.pre_connect_script)
    .bind(&input.post_connect_script)
    .execute(pool)
    .await
    .context("insert host")?;

    get(pool, &id).await
}

/// Fetch a single host by id.
pub async fn get(pool: &DbPool, id: &str) -> Result<Host> {
    let row = sqlx::query_as::<_, Host>(
        "SELECT id, label, hostname, port, username, group_id, proxy_jump_host_id, identity_id,
                agent_forward, log_to_file, pre_connect_script, post_connect_script,
                created_at, updated_at
         FROM hosts WHERE id = ?1",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .with_context(|| format!("fetch host {id}"))?;
    Ok(row)
}

/// Update an existing host. Returns the updated row.
pub async fn update(pool: &DbPool, id: &str, input: HostInput) -> Result<Host> {
    sqlx::query(
        "UPDATE hosts
         SET label = ?2, hostname = ?3, port = ?4, username = ?5, group_id = ?6,
             proxy_jump_host_id = ?7, identity_id = ?8,
             agent_forward = ?9, log_to_file = ?10,
             pre_connect_script = ?11, post_connect_script = ?12,
             updated_at = datetime('now')
         WHERE id = ?1",
    )
    .bind(id)
    .bind(&input.label)
    .bind(&input.hostname)
    .bind(input.port)
    .bind(&input.username)
    .bind(&input.group_id)
    .bind(&input.proxy_jump_host_id)
    .bind(&input.identity_id)
    .bind(input.agent_forward)
    .bind(input.log_to_file)
    .bind(&input.pre_connect_script)
    .bind(&input.post_connect_script)
    .execute(pool)
    .await
    .with_context(|| format!("update host {id}"))?;

    get(pool, id).await
}

/// Delete a host by id. Returns `true` if a row was deleted.
pub async fn delete(pool: &DbPool, id: &str) -> Result<bool> {
    let res = sqlx::query("DELETE FROM hosts WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await
        .with_context(|| format!("delete host {id}"))?;
    Ok(res.rows_affected() > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::init_pool;

    async fn fresh_pool() -> DbPool {
        let tmp = tempfile::Builder::new()
            .suffix(".sqlite")
            .tempfile()
            .expect("tmp file");
        let path = tmp.path().to_path_buf();
        // keep the file but let the handle drop so sqlite can lock it
        drop(tmp);
        init_pool(&path).await.expect("init pool")
    }

    fn sample() -> HostInput {
        HostInput {
            label: "prod-1".into(),
            hostname: "prod1.example.com".into(),
            port: 22,
            username: "deploy".into(),
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
    async fn crud_round_trip() {
        let pool = fresh_pool().await;

        // create
        let created = create(&pool, sample()).await.expect("create");
        assert_eq!(created.label, "prod-1");
        assert_eq!(created.port, 22);

        // list returns it
        let rows = list(&pool).await.expect("list");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, created.id);

        // update
        let updated = update(
            &pool,
            &created.id,
            HostInput {
                label: "prod-1-renamed".into(),
                hostname: "prod1.example.com".into(),
                port: 2222,
                username: "deploy".into(),
                group_id: None,
                proxy_jump_host_id: None,
                identity_id: None,
                agent_forward: false,
                log_to_file: false,
                pre_connect_script: String::new(),
                post_connect_script: String::new(),
            },
        )
        .await
        .expect("update");
        assert_eq!(updated.label, "prod-1-renamed");
        assert_eq!(updated.port, 2222);

        // delete
        let deleted = delete(&pool, &created.id).await.expect("delete");
        assert!(deleted);
        assert!(list(&pool).await.expect("list2").is_empty());
    }

    #[tokio::test]
    async fn delete_unknown_returns_false() {
        let pool = fresh_pool().await;
        let deleted = delete(&pool, "not-a-real-id").await.expect("delete");
        assert!(!deleted);
    }
}
