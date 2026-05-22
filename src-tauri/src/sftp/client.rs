//! High-level SFTP client.
//!
//! Each [`SftpClient`] owns a russh-sftp `SftpSession` riding on a dedicated
//! SSH channel. The session can be cloned cheaply because the inner type is
//! reference-counted (it wraps a tokio task), so we keep one client per
//! `Session` and reuse it for every SFTP command.

use std::time::{Duration, UNIX_EPOCH};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use russh::client::Handle;
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::FileAttributes;

use crate::models::FileEntry;
use crate::ssh::client::Handler;

/// Owning handle to an SFTP subsystem channel.
pub struct SftpClient {
    inner: SftpSession,
}

impl SftpClient {
    /// Open a new SFTP subsystem on the given SSH session handle.
    pub async fn open(handle: &Handle<Handler>) -> Result<Self> {
        let channel = handle
            .channel_open_session()
            .await
            .context("open ssh channel for sftp")?;
        channel
            .request_subsystem(false, "sftp")
            .await
            .context("request sftp subsystem")?;
        let inner = SftpSession::new(channel.into_stream())
            .await
            .context("init sftp session")?;
        Ok(Self { inner })
    }

    /// List the children of `path`, sorted with directories first then by name.
    pub async fn read_dir(&self, path: &str) -> Result<Vec<FileEntry>> {
        let entries = self
            .inner
            .read_dir(path)
            .await
            .with_context(|| format!("read_dir {path}"))?;

        let mut out: Vec<FileEntry> = entries
            .filter(|e| e.file_name() != "." && e.file_name() != "..")
            .map(|e| {
                let attrs = e.metadata();
                file_entry_from(e.file_name(), &attrs)
            })
            .collect();

        out.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir) // dirs first (true > false)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        Ok(out)
    }

    /// Stat a single path (does not follow symlinks if it is one).
    pub async fn stat(&self, path: &str) -> Result<FileEntry> {
        let attrs = self
            .inner
            .metadata(path.to_string())
            .await
            .with_context(|| format!("stat {path}"))?;
        let name = path
            .rsplit_once('/')
            .map(|(_, n)| n.to_string())
            .unwrap_or_else(|| path.to_string());
        Ok(file_entry_from(name, &attrs))
    }

    pub async fn create_dir(&self, path: &str) -> Result<()> {
        self.inner
            .create_dir(path.to_string())
            .await
            .with_context(|| format!("mkdir {path}"))
    }

    /// Remove `path`. Dispatches between `remove_file` and `remove_dir` based
    /// on a stat — the SFTP protocol has distinct opcodes for each.
    pub async fn remove(&self, path: &str) -> Result<()> {
        let attrs = self
            .inner
            .metadata(path.to_string())
            .await
            .with_context(|| format!("stat for remove {path}"))?;
        if attrs.is_dir() {
            self.inner
                .remove_dir(path.to_string())
                .await
                .with_context(|| format!("rmdir {path}"))
        } else {
            self.inner
                .remove_file(path.to_string())
                .await
                .with_context(|| format!("unlink {path}"))
        }
    }

    pub async fn rename(&self, from: &str, to: &str) -> Result<()> {
        self.inner
            .rename(from.to_string(), to.to_string())
            .await
            .with_context(|| format!("rename {from} -> {to}"))
    }
}

fn file_entry_from(name: String, attrs: &FileAttributes) -> FileEntry {
    let is_dir = attrs.is_dir();
    let is_symlink = attrs.is_symlink();
    let size = attrs.size;
    let permissions = attrs.permissions.map(|p| p & 0o7777);
    let mtime = attrs.mtime.map(|secs| {
        let dt: DateTime<Utc> = (UNIX_EPOCH + Duration::from_secs(u64::from(secs))).into();
        dt.to_rfc3339()
    });

    FileEntry {
        name,
        is_dir,
        is_symlink,
        size,
        mtime,
        permissions,
    }
}
