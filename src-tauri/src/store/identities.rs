//! DAO for the `identities` + `identity_keys` tables (P4-T05).

use anyhow::{Context, Result};
use uuid::Uuid;

use crate::models::{Identity, IdentityInput, IdentityKeyLink, SshKey};

use super::DbPool;

const COLS: &str = "id, name, username, agent_forward, created_at, updated_at";

pub async fn list(pool: &DbPool) -> Result<Vec<Identity>> {
    let rows = sqlx::query_as::<_, Identity>(&format!(
        "SELECT {COLS} FROM identities ORDER BY name COLLATE NOCASE ASC"
    ))
    .fetch_all(pool)
    .await
    .context("list identities")?;
    Ok(rows)
}

pub async fn get(pool: &DbPool, id: &str) -> Result<Identity> {
    let row = sqlx::query_as::<_, Identity>(&format!("SELECT {COLS} FROM identities WHERE id = ?1"))
        .bind(id)
        .fetch_one(pool)
        .await
        .with_context(|| format!("fetch identity {id}"))?;
    Ok(row)
}

pub async fn create(pool: &DbPool, input: IdentityInput) -> Result<Identity> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO identities (id, name, username, agent_forward) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(&id)
    .bind(&input.name)
    .bind(&input.username)
    .bind(input.agent_forward)
    .execute(pool)
    .await
    .context("insert identity")?;
    get(pool, &id).await
}

pub async fn update(pool: &DbPool, id: &str, input: IdentityInput) -> Result<Identity> {
    sqlx::query(
        "UPDATE identities
         SET name = ?2, username = ?3, agent_forward = ?4, updated_at = datetime('now')
         WHERE id = ?1",
    )
    .bind(id)
    .bind(&input.name)
    .bind(&input.username)
    .bind(input.agent_forward)
    .execute(pool)
    .await
    .with_context(|| format!("update identity {id}"))?;
    get(pool, id).await
}

pub async fn delete(pool: &DbPool, id: &str) -> Result<bool> {
    let res = sqlx::query("DELETE FROM identities WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await
        .with_context(|| format!("delete identity {id}"))?;
    Ok(res.rows_affected() > 0)
}

/// Replace the ordered set of keys attached to an identity.
pub async fn set_identity_keys(
    pool: &DbPool,
    identity_id: &str,
    key_ids: &[String],
) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM identity_keys WHERE identity_id = ?1")
        .bind(identity_id)
        .execute(&mut *tx)
        .await?;
    for (i, key_id) in key_ids.iter().enumerate() {
        sqlx::query("INSERT INTO identity_keys (identity_id, key_id, priority) VALUES (?1, ?2, ?3)")
            .bind(identity_id)
            .bind(key_id)
            .bind(i as i32)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn list_links(pool: &DbPool) -> Result<Vec<IdentityKeyLink>> {
    let rows = sqlx::query_as::<_, IdentityKeyLink>(
        "SELECT identity_id, key_id, priority
         FROM identity_keys
         ORDER BY identity_id, priority ASC",
    )
    .fetch_all(pool)
    .await
    .context("list identity_keys")?;
    Ok(rows)
}

/// Resolve the priority-ordered list of `SshKey` rows attached to an
/// identity. Used at SSH-connect time to seed `KeyAuth`.
pub async fn list_keys_for_identity(pool: &DbPool, identity_id: &str) -> Result<Vec<SshKey>> {
    let rows = sqlx::query_as::<_, SshKey>(
        "SELECT k.id, k.name, k.key_type, k.public_key, k.fingerprint,
                k.private_key_path, k.has_passphrase, k.created_at
         FROM ssh_keys k
         INNER JOIN identity_keys ik ON ik.key_id = k.id
         WHERE ik.identity_id = ?1
         ORDER BY ik.priority ASC",
    )
    .bind(identity_id)
    .fetch_all(pool)
    .await
    .with_context(|| format!("list keys for identity {identity_id}"))?;
    Ok(rows)
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

    fn sample(name: &str) -> IdentityInput {
        IdentityInput {
            name: name.into(),
            username: "deploy".into(),
            agent_forward: false,
        }
    }

    #[tokio::test]
    async fn crud_round_trip() {
        let pool = fresh_pool().await;
        let i = create(&pool, sample("prod")).await.expect("create");
        assert_eq!(i.username, "deploy");

        let listed = list(&pool).await.expect("list");
        assert_eq!(listed.len(), 1);

        let updated = update(
            &pool,
            &i.id,
            IdentityInput {
                name: "prod-renamed".into(),
                username: "root".into(),
                agent_forward: true,
            },
        )
        .await
        .expect("update");
        assert_eq!(updated.name, "prod-renamed");
        assert_eq!(updated.username, "root");
        assert!(updated.agent_forward);

        assert!(delete(&pool, &i.id).await.expect("delete"));
        assert!(list(&pool).await.expect("relist").is_empty());
    }

    #[tokio::test]
    async fn unique_name_enforced() {
        let pool = fresh_pool().await;
        create(&pool, sample("dup")).await.expect("first");
        let r = create(&pool, sample("DUP")).await;
        assert!(r.is_err(), "case-insensitive uniqueness should reject DUP");
    }
}
