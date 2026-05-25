//! DAO for the `tags` + `host_tags` tables.

use anyhow::{Context, Result};
use uuid::Uuid;

use crate::models::{HostTagLink, Tag, TagInput};

use super::DbPool;

/// Return all tags ordered by name (case-insensitive).
pub async fn list(pool: &DbPool) -> Result<Vec<Tag>> {
    let rows = sqlx::query_as::<_, Tag>(
        "SELECT id, name, color, created_at
         FROM tags
         ORDER BY name COLLATE NOCASE ASC",
    )
    .fetch_all(pool)
    .await
    .context("list tags")?;
    Ok(rows)
}

/// Insert a new tag.
pub async fn create(pool: &DbPool, input: TagInput) -> Result<Tag> {
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO tags (id, name, color) VALUES (?1, ?2, ?3)")
        .bind(&id)
        .bind(&input.name)
        .bind(&input.color)
        .execute(pool)
        .await
        .context("insert tag")?;
    get(pool, &id).await
}

/// Fetch a single tag by id.
pub async fn get(pool: &DbPool, id: &str) -> Result<Tag> {
    let row =
        sqlx::query_as::<_, Tag>("SELECT id, name, color, created_at FROM tags WHERE id = ?1")
            .bind(id)
            .fetch_one(pool)
            .await
            .with_context(|| format!("fetch tag {id}"))?;
    Ok(row)
}

/// Update a tag (rename / recolor).
pub async fn update(pool: &DbPool, id: &str, input: TagInput) -> Result<Tag> {
    sqlx::query("UPDATE tags SET name = ?2, color = ?3 WHERE id = ?1")
        .bind(id)
        .bind(&input.name)
        .bind(&input.color)
        .execute(pool)
        .await
        .with_context(|| format!("update tag {id}"))?;
    get(pool, id).await
}

/// Delete a tag; cascade removes its host_tags rows.
pub async fn delete(pool: &DbPool, id: &str) -> Result<bool> {
    let res = sqlx::query("DELETE FROM tags WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await
        .with_context(|| format!("delete tag {id}"))?;
    Ok(res.rows_affected() > 0)
}

/// Replace the set of tags attached to a host.
pub async fn set_host_tags(pool: &DbPool, host_id: &str, tag_ids: &[String]) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM host_tags WHERE host_id = ?1")
        .bind(host_id)
        .execute(&mut *tx)
        .await?;
    for tag_id in tag_ids {
        sqlx::query("INSERT OR IGNORE INTO host_tags (host_id, tag_id) VALUES (?1, ?2)")
            .bind(host_id)
            .bind(tag_id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// Return all `(host_id, tag_id)` links, used by the front to derive both
/// "tags of host" and "hosts of tag" without N+1 queries.
pub async fn list_host_tag_links(pool: &DbPool) -> Result<Vec<HostTagLink>> {
    let rows = sqlx::query_as::<_, HostTagLink>("SELECT host_id, tag_id FROM host_tags")
        .fetch_all(pool)
        .await
        .context("list host_tag links")?;
    Ok(rows)
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

    fn sample(name: &str) -> TagInput {
        TagInput {
            name: name.into(),
            color: "#22c55e".into(),
        }
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
    async fn crud_round_trip() {
        let pool = fresh_pool().await;
        let created = create(&pool, sample("prod")).await.expect("create");
        assert_eq!(created.name, "prod");
        let listed = list(&pool).await.expect("list");
        assert_eq!(listed.len(), 1);

        let renamed = update(
            &pool,
            &created.id,
            TagInput {
                name: "production".into(),
                color: "#3b82f6".into(),
            },
        )
        .await
        .expect("update");
        assert_eq!(renamed.name, "production");
        assert_eq!(renamed.color, "#3b82f6");

        assert!(delete(&pool, &created.id).await.expect("delete"));
        assert!(list(&pool).await.expect("list2").is_empty());
    }

    #[tokio::test]
    async fn set_and_replace_host_tags() {
        let pool = fresh_pool().await;
        let h = hosts_dao::create(&pool, host("h")).await.expect("h");
        let t1 = create(&pool, sample("a")).await.expect("t1");
        let t2 = create(&pool, sample("b")).await.expect("t2");
        let t3 = create(&pool, sample("c")).await.expect("t3");

        set_host_tags(&pool, &h.id, &[t1.id.clone(), t2.id.clone()])
            .await
            .expect("set 1");
        let links = list_host_tag_links(&pool).await.expect("links");
        assert_eq!(links.len(), 2);

        // Replace with a different set
        set_host_tags(&pool, &h.id, std::slice::from_ref(&t3.id))
            .await
            .expect("set 2");
        let links2 = list_host_tag_links(&pool).await.expect("links2");
        assert_eq!(links2.len(), 1);
        assert_eq!(links2[0].tag_id, t3.id);
    }

    #[tokio::test]
    async fn deleting_host_cascades_links() {
        let pool = fresh_pool().await;
        let h = hosts_dao::create(&pool, host("h")).await.expect("h");
        let t = create(&pool, sample("a")).await.expect("t");
        set_host_tags(&pool, &h.id, std::slice::from_ref(&t.id))
            .await
            .expect("set");
        assert_eq!(list_host_tag_links(&pool).await.unwrap().len(), 1);
        hosts_dao::delete(&pool, &h.id).await.expect("del host");
        assert_eq!(list_host_tag_links(&pool).await.unwrap().len(), 0);
    }
}
