//! Persistence layer: SQLite pool + migrations + DAOs.

mod db;
pub mod hosts;

pub use db::{init_pool, DbPool};
