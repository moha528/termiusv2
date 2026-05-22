use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A single entry returned by an SFTP listing.
///
/// `size`, `mtime` and `permissions` are absent when the SFTP server doesn't
/// expose them (rare, but allowed by the protocol).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/bindings/FileEntry.ts")]
pub struct FileEntry {
    /// Bare name of the file (no leading path).
    pub name: String,
    /// True when the entry is a directory (after symlink resolution by SFTP).
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: Option<u64>,
    /// Modification time as RFC 3339 UTC, or `None` when not provided.
    pub mtime: Option<String>,
    /// Unix-style permission bits (lower 12 bits), `None` when not provided.
    pub permissions: Option<u32>,
}
