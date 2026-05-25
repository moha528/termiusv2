//! DAO for the `ssh_keys` table. Mirrors `store::hosts` but for SSH key
//! metadata. The actual key files live on disk; we only persist the path.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::models::SshKey;

use super::DbPool;

/// (host_id, key_id, priority) row from the `host_keys` join table.
#[derive(Debug, Clone, Serialize, Deserialize, TS, sqlx::FromRow)]
#[ts(export, export_to = "../../src/lib/bindings/HostKeyLink.ts")]
pub struct HostKeyLink {
    pub host_id: String,
    pub key_id: String,
    pub priority: i32,
}

/// Return every registered SSH key, ordered by name (case-insensitive).
pub async fn list(pool: &DbPool) -> Result<Vec<SshKey>> {
    let rows = sqlx::query_as::<_, SshKey>(
        "SELECT id, name, key_type, public_key, fingerprint, private_key_path,
                has_passphrase, created_at
         FROM ssh_keys
         ORDER BY name COLLATE NOCASE ASC",
    )
    .fetch_all(pool)
    .await
    .context("list ssh_keys")?;
    Ok(rows)
}

pub async fn get(pool: &DbPool, id: &str) -> Result<SshKey> {
    let row = sqlx::query_as::<_, SshKey>(
        "SELECT id, name, key_type, public_key, fingerprint, private_key_path,
                has_passphrase, created_at
         FROM ssh_keys WHERE id = ?1",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .with_context(|| format!("fetch ssh_key {id}"))?;
    Ok(row)
}

/// Insert a new row. The caller has already written the private key file
/// and built the SshKey struct.
pub async fn insert(pool: &DbPool, key: &SshKey) -> Result<()> {
    sqlx::query(
        "INSERT INTO ssh_keys (id, name, key_type, public_key, fingerprint,
                                private_key_path, has_passphrase)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(&key.id)
    .bind(&key.name)
    .bind(&key.key_type)
    .bind(&key.public_key)
    .bind(&key.fingerprint)
    .bind(&key.private_key_path)
    .bind(key.has_passphrase)
    .execute(pool)
    .await
    .context("insert ssh_key")?;
    Ok(())
}

/// Delete a row and return whether one was found.
pub async fn delete(pool: &DbPool, id: &str) -> Result<bool> {
    let res = sqlx::query("DELETE FROM ssh_keys WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await
        .with_context(|| format!("delete ssh_key {id}"))?;
    Ok(res.rows_affected() > 0)
}

/// Return every (host_id, key_id) link, used by the front to derive both
/// "keys of host" and "hosts of key" without per-host queries.
pub async fn list_host_key_links(pool: &DbPool) -> Result<Vec<HostKeyLink>> {
    let rows = sqlx::query_as::<_, HostKeyLink>(
        "SELECT host_id, key_id, priority FROM host_keys ORDER BY host_id, priority ASC",
    )
    .fetch_all(pool)
    .await
    .context("list host_key links")?;
    Ok(rows)
}

/// Replace the set of keys associated with `host_id`.
/// `key_ids` is taken in order — index 0 has priority 0 (highest).
pub async fn set_host_keys(pool: &DbPool, host_id: &str, key_ids: &[String]) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM host_keys WHERE host_id = ?1")
        .bind(host_id)
        .execute(&mut *tx)
        .await?;
    for (i, key_id) in key_ids.iter().enumerate() {
        sqlx::query(
            "INSERT OR IGNORE INTO host_keys (host_id, key_id, priority) VALUES (?1, ?2, ?3)",
        )
        .bind(host_id)
        .bind(key_id)
        .bind(i as i64)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// Return the SSH keys attached to `host_id`, ordered by priority ASC.
pub async fn list_for_host(pool: &DbPool, host_id: &str) -> Result<Vec<SshKey>> {
    let rows = sqlx::query_as::<_, SshKey>(
        "SELECT k.id, k.name, k.key_type, k.public_key, k.fingerprint,
                k.private_key_path, k.has_passphrase, k.created_at
         FROM ssh_keys k
         INNER JOIN host_keys hk ON hk.key_id = k.id
         WHERE hk.host_id = ?1
         ORDER BY hk.priority ASC, k.name COLLATE NOCASE ASC",
    )
    .bind(host_id)
    .fetch_all(pool)
    .await
    .with_context(|| format!("list keys for host {host_id}"))?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::SshKey;
    use crate::store::init_pool;

    async fn fresh_pool() -> DbPool {
        let tmp = tempfile::Builder::new()
            .suffix(".sqlite")
            .tempfile()
            .expect("tmp file");
        let path = tmp.path().to_path_buf();
        drop(tmp);
        init_pool(&path).await.expect("init pool")
    }

    fn sample(name: &str) -> SshKey {
        SshKey {
            id: format!("id-{name}"),
            name: name.into(),
            key_type: "ed25519".into(),
            public_key: "ssh-ed25519 AAAA...".into(),
            fingerprint: "SHA256:abc".into(),
            private_key_path: format!("/tmp/{name}"),
            has_passphrase: false,
            created_at: String::new(),
        }
    }

    #[tokio::test]
    async fn insert_and_list() {
        let pool = fresh_pool().await;
        insert(&pool, &sample("k1")).await.expect("insert");
        insert(&pool, &sample("k2")).await.expect("insert");
        let rows = list(&pool).await.expect("list");
        assert_eq!(rows.len(), 2);
    }

    #[tokio::test]
    async fn delete_round_trip() {
        let pool = fresh_pool().await;
        insert(&pool, &sample("k1")).await.expect("insert");
        assert!(delete(&pool, "id-k1").await.expect("delete"));
        assert!(list(&pool).await.expect("list").is_empty());
        assert!(!delete(&pool, "id-k1").await.expect("delete2"));
    }
}
