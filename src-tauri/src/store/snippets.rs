//! DAO for the `snippets` table (P4-T01).

use anyhow::{Context, Result};
use uuid::Uuid;

use crate::models::{Snippet, SnippetInput};

use super::DbPool;

const COLS: &str =
    "id, name, content, folder, tags_csv, variables_schema_json, created_at, updated_at";

pub async fn list(pool: &DbPool) -> Result<Vec<Snippet>> {
    let rows = sqlx::query_as::<_, Snippet>(&format!(
        "SELECT {COLS} FROM snippets
         ORDER BY (folder IS NULL), folder COLLATE NOCASE ASC, name COLLATE NOCASE ASC"
    ))
    .fetch_all(pool)
    .await
    .context("list snippets")?;
    Ok(rows)
}

pub async fn get(pool: &DbPool, id: &str) -> Result<Snippet> {
    let row = sqlx::query_as::<_, Snippet>(&format!("SELECT {COLS} FROM snippets WHERE id = ?1"))
        .bind(id)
        .fetch_one(pool)
        .await
        .with_context(|| format!("fetch snippet {id}"))?;
    Ok(row)
}

pub async fn create(pool: &DbPool, input: SnippetInput) -> Result<Snippet> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO snippets (id, name, content, folder, tags_csv, variables_schema_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(&id)
    .bind(&input.name)
    .bind(&input.content)
    .bind(&input.folder)
    .bind(&input.tags_csv)
    .bind(&input.variables_schema_json)
    .execute(pool)
    .await
    .context("insert snippet")?;
    get(pool, &id).await
}

pub async fn update(pool: &DbPool, id: &str, input: SnippetInput) -> Result<Snippet> {
    sqlx::query(
        "UPDATE snippets
         SET name = ?2, content = ?3, folder = ?4, tags_csv = ?5,
             variables_schema_json = ?6, updated_at = datetime('now')
         WHERE id = ?1",
    )
    .bind(id)
    .bind(&input.name)
    .bind(&input.content)
    .bind(&input.folder)
    .bind(&input.tags_csv)
    .bind(&input.variables_schema_json)
    .execute(pool)
    .await
    .with_context(|| format!("update snippet {id}"))?;
    get(pool, id).await
}

pub async fn delete(pool: &DbPool, id: &str) -> Result<bool> {
    let res = sqlx::query("DELETE FROM snippets WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await
        .with_context(|| format!("delete snippet {id}"))?;
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
            .expect("tmp");
        let path = tmp.path().to_path_buf();
        drop(tmp);
        init_pool(&path).await.expect("init pool")
    }

    fn sample(name: &str, folder: Option<&str>) -> SnippetInput {
        SnippetInput {
            name: name.into(),
            content: "echo {{host}}".into(),
            folder: folder.map(|s| s.into()),
            tags_csv: "ops,logs".into(),
            variables_schema_json: "[]".into(),
        }
    }

    #[tokio::test]
    async fn crud_round_trip() {
        let pool = fresh_pool().await;
        let s = create(&pool, sample("hello", Some("infra")))
            .await
            .expect("create");
        assert_eq!(s.name, "hello");
        assert_eq!(s.folder.as_deref(), Some("infra"));

        let listed = list(&pool).await.expect("list");
        assert_eq!(listed.len(), 1);

        let updated = update(
            &pool,
            &s.id,
            SnippetInput {
                name: "hello-2".into(),
                content: "uname -a".into(),
                folder: None,
                tags_csv: String::new(),
                variables_schema_json: "[]".into(),
            },
        )
        .await
        .expect("update");
        assert_eq!(updated.name, "hello-2");
        assert!(updated.folder.is_none());

        assert!(delete(&pool, &s.id).await.expect("delete"));
        assert!(list(&pool).await.expect("relist").is_empty());
    }

    #[tokio::test]
    async fn list_orders_folder_then_name() {
        let pool = fresh_pool().await;
        create(&pool, sample("b-orphan", None)).await.unwrap();
        create(&pool, sample("a-orphan", None)).await.unwrap();
        create(&pool, sample("b", Some("infra"))).await.unwrap();
        create(&pool, sample("a", Some("infra"))).await.unwrap();
        create(&pool, sample("z", Some("dev"))).await.unwrap();

        let listed = list(&pool).await.expect("list");
        let names: Vec<&str> = listed.iter().map(|s| s.name.as_str()).collect();
        // dev first (alpha < infra), then infra, then null folder rows alpha.
        assert_eq!(names, vec!["z", "a", "b", "a-orphan", "b-orphan"]);
    }
}
