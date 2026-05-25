//! DAO for the `port_forwards` table.

use anyhow::{Context, Result};
use uuid::Uuid;

use crate::models::{PortForward, PortForwardInput};

use super::DbPool;

pub async fn list_for_host(pool: &DbPool, host_id: &str) -> Result<Vec<PortForward>> {
    let rows = sqlx::query_as::<_, PortForward>(
        "SELECT id, host_id, forward_type, label, local_port, remote_host,
                remote_port, auto_start, created_at
         FROM port_forwards
         WHERE host_id = ?1
         ORDER BY local_port ASC",
    )
    .bind(host_id)
    .fetch_all(pool)
    .await
    .with_context(|| format!("list port_forwards for {host_id}"))?;
    Ok(rows)
}

pub async fn list_all(pool: &DbPool) -> Result<Vec<PortForward>> {
    let rows = sqlx::query_as::<_, PortForward>(
        "SELECT id, host_id, forward_type, label, local_port, remote_host,
                remote_port, auto_start, created_at
         FROM port_forwards
         ORDER BY host_id, local_port",
    )
    .fetch_all(pool)
    .await
    .context("list all port_forwards")?;
    Ok(rows)
}

pub async fn get(pool: &DbPool, id: &str) -> Result<PortForward> {
    let row = sqlx::query_as::<_, PortForward>(
        "SELECT id, host_id, forward_type, label, local_port, remote_host,
                remote_port, auto_start, created_at
         FROM port_forwards WHERE id = ?1",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .with_context(|| format!("fetch port_forward {id}"))?;
    Ok(row)
}

pub async fn create(pool: &DbPool, input: PortForwardInput) -> Result<PortForward> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO port_forwards (id, host_id, forward_type, label, local_port,
                                    remote_host, remote_port, auto_start)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )
    .bind(&id)
    .bind(&input.host_id)
    .bind(input.forward_type.as_str())
    .bind(&input.label)
    .bind(input.local_port)
    .bind(&input.remote_host)
    .bind(input.remote_port)
    .bind(input.auto_start)
    .execute(pool)
    .await
    .context("insert port_forward")?;
    get(pool, &id).await
}

pub async fn update(pool: &DbPool, id: &str, input: PortForwardInput) -> Result<PortForward> {
    sqlx::query(
        "UPDATE port_forwards
         SET host_id = ?2, forward_type = ?3, label = ?4, local_port = ?5,
             remote_host = ?6, remote_port = ?7, auto_start = ?8
         WHERE id = ?1",
    )
    .bind(id)
    .bind(&input.host_id)
    .bind(input.forward_type.as_str())
    .bind(&input.label)
    .bind(input.local_port)
    .bind(&input.remote_host)
    .bind(input.remote_port)
    .bind(input.auto_start)
    .execute(pool)
    .await
    .with_context(|| format!("update port_forward {id}"))?;
    get(pool, id).await
}

pub async fn delete(pool: &DbPool, id: &str) -> Result<bool> {
    let res = sqlx::query("DELETE FROM port_forwards WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await
        .with_context(|| format!("delete port_forward {id}"))?;
    Ok(res.rows_affected() > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ForwardType, HostInput};
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

    fn sample(host_id: String, local_port: i32) -> PortForwardInput {
        PortForwardInput {
            host_id,
            forward_type: ForwardType::Local,
            label: format!("forward {local_port}"),
            local_port,
            remote_host: "localhost".into(),
            remote_port: 80,
            auto_start: false,
        }
    }

    #[tokio::test]
    async fn crud_round_trip() {
        let pool = fresh_pool().await;
        let host = hosts_dao::create(
            &pool,
            HostInput {
                label: "h".into(),
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
            },
        )
        .await
        .expect("host");

        let fwd = create(&pool, sample(host.id.clone(), 8080))
            .await
            .expect("create");
        assert_eq!(fwd.local_port, 8080);
        assert_eq!(fwd.forward_type, "local");

        let listed = list_for_host(&pool, &host.id).await.expect("list");
        assert_eq!(listed.len(), 1);

        let mut next = sample(host.id.clone(), 9090);
        next.label = "renamed".into();
        let updated = update(&pool, &fwd.id, next).await.expect("update");
        assert_eq!(updated.local_port, 9090);
        assert_eq!(updated.label, "renamed");

        assert!(delete(&pool, &fwd.id).await.expect("delete"));
        assert!(list_for_host(&pool, &host.id).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn cascade_on_host_delete() {
        let pool = fresh_pool().await;
        let host = hosts_dao::create(
            &pool,
            HostInput {
                label: "h".into(),
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
            },
        )
        .await
        .expect("host");
        create(&pool, sample(host.id.clone(), 1234))
            .await
            .expect("c");
        assert_eq!(list_all(&pool).await.unwrap().len(), 1);
        hosts_dao::delete(&pool, &host.id).await.expect("del host");
        assert_eq!(list_all(&pool).await.unwrap().len(), 0);
    }
}
