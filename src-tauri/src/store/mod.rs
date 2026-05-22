//! Persistence layer: SQLite pool + migrations + DAOs.

mod db;
pub mod hosts;

pub use db::{default_db_path, init_pool, DbPool};
