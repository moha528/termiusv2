//! DAO for the `groups` table.

use anyhow::{Context, Result};
use uuid::Uuid;

use crate::models::{Group, GroupInput};

use super::DbPool;

/// Return all groups, ordered by name (case-insensitive).
pub async fn list(pool: &DbPool) -> Result<Vec<Group>> {
    let rows = sqlx::query_as::<_, Group>(
        "SELECT id, name, parent_id, position, created_at, updated_at
         FROM groups
         ORDER BY position ASC, name COLLATE NOCASE ASC",
    )
    .fetch_all(pool)
    .await
    .context("list groups")?;
    Ok(rows)
}

/// Fetch a single group by id.
pub async fn get(pool: &DbPool, id: &str) -> Result<Group> {
    let row = sqlx::query_as::<_, Group>(
        "SELECT id, name, parent_id, position, created_at, updated_at
         FROM groups WHERE id = ?1",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .with_context(|| format!("fetch group {id}"))?;
    Ok(row)
}

/// Insert a new group, generating a fresh UUID v4 as its id.
pub async fn create(pool: &DbPool, input: GroupInput) -> Result<Group> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO groups (id, name, parent_id, position)
         VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(&id)
    .bind(&input.name)
    .bind(&input.parent_id)
    .bind(input.position)
    .execute(pool)
    .await
    .context("insert group")?;
    get(pool, &id).await
}

/// Update an existing group (rename / move).
pub async fn update(pool: &DbPool, id: &str, input: GroupInput) -> Result<Group> {
    sqlx::query(
        "UPDATE groups
         SET name = ?2, parent_id = ?3, position = ?4, updated_at = datetime('now')
         WHERE id = ?1",
    )
    .bind(id)
    .bind(&input.name)
    .bind(&input.parent_id)
    .bind(input.position)
    .execute(pool)
    .await
    .with_context(|| format!("update group {id}"))?;
    get(pool, id).await
}

/// Delete a group. Hosts attached to it are detached (ON DELETE SET NULL).
pub async fn delete(pool: &DbPool, id: &str) -> Result<bool> {
    let res = sqlx::query("DELETE FROM groups WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await
        .with_context(|| format!("delete group {id}"))?;
    Ok(res.rows_affected() > 0)
}

/// Move a host into a group (or unassign by passing `None`).
pub async fn move_host(pool: &DbPool, host_id: &str, group_id: Option<&str>) -> Result<()> {
    sqlx::query(
        "UPDATE hosts SET group_id = ?2, updated_at = datetime('now')
         WHERE id = ?1",
    )
    .bind(host_id)
    .bind(group_id)
    .execute(pool)
    .await
    .with_context(|| format!("move host {host_id}"))?;
    Ok(())
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
            .expect("tmp file");
        let path = tmp.path().to_path_buf();
        drop(tmp);
        init_pool(&path).await.expect("init pool")
    }

    fn sample(name: &str) -> GroupInput {
        GroupInput {
            name: name.into(),
            parent_id: None,
            position: 0,
        }
    }

    #[tokio::test]
    async fn crud_round_trip() {
        let pool = fresh_pool().await;
        let created = create(&pool, sample("prod")).await.expect("create");
        assert_eq!(created.name, "prod");

        let rows = list(&pool).await.expect("list");
        assert_eq!(rows.len(), 1);

        let renamed = update(
            &pool,
            &created.id,
            GroupInput {
                name: "production".into(),
                parent_id: None,
                position: 1,
            },
        )
        .await
        .expect("update");
        assert_eq!(renamed.name, "production");
        assert_eq!(renamed.position, 1);

        let deleted = delete(&pool, &created.id).await.expect("delete");
        assert!(deleted);
        assert!(list(&pool).await.expect("list2").is_empty());
    }

    #[tokio::test]
    async fn move_host_detaches_then_attaches() {
        let pool = fresh_pool().await;
        let group = create(&pool, sample("staging")).await.expect("create");

        let host = hosts_dao::create(
            &pool,
            HostInput {
                label: "h".into(),
                hostname: "h.example".into(),
                port: 22,
                username: "u".into(),
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
        .expect("create host");
        assert!(host.group_id.is_none());

        move_host(&pool, &host.id, Some(&group.id))
            .await
            .expect("attach");
        let reread = hosts_dao::get(&pool, &host.id).await.expect("get");
        assert_eq!(reread.group_id.as_deref(), Some(group.id.as_str()));

        move_host(&pool, &host.id, None).await.expect("detach");
        let reread2 = hosts_dao::get(&pool, &host.id).await.expect("get");
        assert!(reread2.group_id.is_none());
    }

    #[tokio::test]
    async fn delete_group_detaches_hosts() {
        let pool = fresh_pool().await;
        let g = create(&pool, sample("g")).await.expect("create");
        let h = hosts_dao::create(
            &pool,
            HostInput {
                label: "h".into(),
                hostname: "h".into(),
                port: 22,
                username: "u".into(),
                group_id: Some(g.id.clone()),
                proxy_jump_host_id: None,
                identity_id: None,
                agent_forward: false,
                log_to_file: false,
                pre_connect_script: String::new(),
                post_connect_script: String::new(),
            },
        )
        .await
        .expect("create host");
        delete(&pool, &g.id).await.expect("delete");
        let reread = hosts_dao::get(&pool, &h.id).await.expect("get");
        assert!(reread.group_id.is_none());
    }
}
