//! Persistence layer: SQLite pool + migrations + DAOs.

mod db;
pub mod command_history;
pub mod groups;
pub mod hosts;
pub mod identities;
pub mod known_hosts;
pub mod port_forwards;
pub mod settings;
pub mod snippets;
pub mod ssh_keys;
pub mod sync_state;
pub mod tags;

pub use db::{default_db_path, init_pool, DbPool};
