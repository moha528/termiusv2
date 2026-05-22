//! DAO for the `known_hosts` table (Trust-On-First-Use server fingerprints).
//!
//! Semantics:
//! - First time we connect to (hostname, port) → record the fingerprint, accept.
//! - Subsequent connection with the same fingerprint → accept.
//! - Subsequent connection with a *different* fingerprint → refuse (caller
//!   must surface this to the user). At this stage we do not delete the
//!   existing entry — replacing it is an explicit user action handled in
//!   ticket P3-T09.

use anyhow::{Context, Result};

use super::DbPool;

/// Outcome of a TOFU check against a single endpoint.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TofuOutcome {
    /// First connection: the fingerprint was recorded and the caller can proceed.
    FirstSeen,
    /// Fingerprint matches the previously accepted one. Safe to continue.
    Match,
    /// Fingerprint differs from the stored one. The caller must refuse the connection
    /// and warn the user. `expected` is what we have on file.
    Mismatch { expected: String },
}

/// Verify `(hostname, port)` against the stored fingerprint, inserting it on first sight.
///
/// `fingerprint` is expected to be the canonical SSH format (e.g. `"SHA256:abc=..."`).
pub async fn verify_or_record(
    pool: &DbPool,
    hostname: &str,
    port: u16,
    fingerprint: &str,
    key_type: &str,
) -> Result<TofuOutcome> {
    let existing: Option<(String,)> =
        sqlx::query_as("SELECT fingerprint FROM known_hosts WHERE hostname = ?1 AND port = ?2")
            .bind(hostname)
            .bind(port as i64)
            .fetch_optional(pool)
            .await
            .context("query known_hosts")?;

    match existing {
        None => {
            sqlx::query(
                "INSERT INTO known_hosts (hostname, port, fingerprint, key_type)
                 VALUES (?1, ?2, ?3, ?4)",
            )
            .bind(hostname)
            .bind(port as i64)
            .bind(fingerprint)
            .bind(key_type)
            .execute(pool)
            .await
            .context("insert known_hosts")?;
            Ok(TofuOutcome::FirstSeen)
        }
        Some((stored,)) if stored == fingerprint => Ok(TofuOutcome::Match),
        Some((stored,)) => Ok(TofuOutcome::Mismatch { expected: stored }),
    }
}

/// Forget a known host so the next connection re-applies TOFU. Returns `true`
/// when a row was removed.
pub async fn forget(pool: &DbPool, hostname: &str, port: u16) -> Result<bool> {
    let res = sqlx::query("DELETE FROM known_hosts WHERE hostname = ?1 AND port = ?2")
        .bind(hostname)
        .bind(port as i64)
        .execute(pool)
        .await
        .context("delete known_hosts")?;
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
        drop(tmp);
        init_pool(&path).await.expect("init pool")
    }

    #[tokio::test]
    async fn first_connection_records_fingerprint() {
        let pool = fresh_pool().await;
        let outcome = verify_or_record(&pool, "host.example.com", 22, "SHA256:aaa", "ssh-ed25519")
            .await
            .expect("verify");
        assert_eq!(outcome, TofuOutcome::FirstSeen);
    }

    #[tokio::test]
    async fn second_connection_with_same_fp_matches() {
        let pool = fresh_pool().await;
        verify_or_record(&pool, "host.example.com", 22, "SHA256:aaa", "ssh-ed25519")
            .await
            .unwrap();
        let outcome = verify_or_record(&pool, "host.example.com", 22, "SHA256:aaa", "ssh-ed25519")
            .await
            .expect("verify");
        assert_eq!(outcome, TofuOutcome::Match);
    }

    #[tokio::test]
    async fn different_fingerprint_is_mismatch() {
        let pool = fresh_pool().await;
        verify_or_record(&pool, "host.example.com", 22, "SHA256:aaa", "ssh-ed25519")
            .await
            .unwrap();
        let outcome = verify_or_record(&pool, "host.example.com", 22, "SHA256:bbb", "ssh-ed25519")
            .await
            .expect("verify");
        assert_eq!(
            outcome,
            TofuOutcome::Mismatch {
                expected: "SHA256:aaa".into()
            }
        );
    }

    #[tokio::test]
    async fn different_port_is_independent() {
        let pool = fresh_pool().await;
        verify_or_record(&pool, "host.example.com", 22, "SHA256:aaa", "ssh-ed25519")
            .await
            .unwrap();
        let outcome = verify_or_record(&pool, "host.example.com", 2222, "SHA256:bbb", "ssh-ed25519")
            .await
            .expect("verify");
        assert_eq!(outcome, TofuOutcome::FirstSeen);
    }

    #[tokio::test]
    async fn forget_removes_entry() {
        let pool = fresh_pool().await;
        verify_or_record(&pool, "host.example.com", 22, "SHA256:aaa", "ssh-ed25519")
            .await
            .unwrap();
        assert!(forget(&pool, "host.example.com", 22).await.unwrap());
        assert!(!forget(&pool, "host.example.com", 22).await.unwrap());
    }
}
