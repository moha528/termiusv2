//! Importers from external configuration formats (currently OpenSSH `~/.ssh/config`).

pub mod ssh_config;

pub use ssh_config::{parse, parse_str, SshConfigEntry};
