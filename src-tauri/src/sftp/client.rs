//! High-level SFTP client.
//!
//! Each [`SftpClient`] owns a russh-sftp `SftpSession` riding on a dedicated
//! SSH channel. The session can be cloned cheaply because the inner type is
//! reference-counted (it wraps a tokio task), so we keep one client per
//! `Session` and reuse it for every SFTP command.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, UNIX_EPOCH};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use russh::client::Handle;
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::FileAttributes;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::models::FileEntry;
use crate::ssh::client::Handler;

/// Size of the chunks we copy between disk and SFTP. Larger than 32 KiB to
/// amortize round-trips, smaller than the default sftp packet so it never
/// gets fragmented twice.
pub const TRANSFER_BUF_SIZE: usize = 64 * 1024;

/// Owning handle to an SFTP subsystem channel.
pub struct SftpClient {
    inner: SftpSession,
}

impl SftpClient {
    /// Open a new SFTP subsystem on the given SSH session handle.
    pub async fn open(handle: &Arc<Handle<Handler>>) -> Result<Self> {
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

    /// Create an empty file (`create` opens with truncate). Returns an error
    /// if `path` already exists so we don't clobber data.
    pub async fn create_file(&self, path: &str) -> Result<()> {
        if self
            .inner
            .try_exists(path.to_string())
            .await
            .unwrap_or(false)
        {
            anyhow::bail!("{path} already exists");
        }
        let mut file = self
            .inner
            .create(path.to_string())
            .await
            .with_context(|| format!("create {path}"))?;
        use tokio::io::AsyncWriteExt;
        file.shutdown()
            .await
            .with_context(|| format!("flush {path}"))
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

    /// Stream `local` → `remote`. Calls `on_progress(bytes_done, total)` every
    /// chunk. `cancel` is checked between chunks; if set the function returns
    /// [`TRANSFER_CANCELLED`] as the error message so callers can detect it.
    pub async fn upload<F>(
        &self,
        local: &Path,
        remote: &str,
        cancel: Arc<AtomicBool>,
        mut on_progress: F,
    ) -> Result<u64>
    where
        F: FnMut(u64, u64) + Send,
    {
        let metadata = tokio::fs::metadata(local)
            .await
            .with_context(|| format!("stat local {}", local.display()))?;
        let total = metadata.len();

        let mut source = tokio::fs::File::open(local)
            .await
            .with_context(|| format!("open local {}", local.display()))?;
        let mut sink = self
            .inner
            .create(remote.to_string())
            .await
            .with_context(|| format!("create remote {remote}"))?;

        let mut buf = vec![0u8; TRANSFER_BUF_SIZE];
        let mut transferred = 0u64;
        loop {
            if cancel.load(Ordering::Relaxed) {
                anyhow::bail!("{TRANSFER_CANCELLED}");
            }
            let n = source.read(&mut buf).await.context("read local")?;
            if n == 0 {
                break;
            }
            sink.write_all(&buf[..n]).await.context("write remote")?;
            transferred += n as u64;
            on_progress(transferred, total);
        }
        sink.shutdown().await.context("shutdown remote file")?;
        Ok(transferred)
    }

    /// Stream `remote` → `local`. Same contract as [`Self::upload`].
    pub async fn download<F>(
        &self,
        remote: &str,
        local: &Path,
        cancel: Arc<AtomicBool>,
        mut on_progress: F,
    ) -> Result<u64>
    where
        F: FnMut(u64, u64) + Send,
    {
        let attrs = self
            .inner
            .metadata(remote.to_string())
            .await
            .with_context(|| format!("stat remote {remote}"))?;
        let total = attrs.size.unwrap_or(0);

        if let Some(parent) = local.parent() {
            if !parent.as_os_str().is_empty() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .with_context(|| format!("mkdir -p {}", parent.display()))?;
            }
        }

        let mut source = self
            .inner
            .open(remote.to_string())
            .await
            .with_context(|| format!("open remote {remote}"))?;
        let mut sink = tokio::fs::File::create(local)
            .await
            .with_context(|| format!("create local {}", local.display()))?;

        let mut buf = vec![0u8; TRANSFER_BUF_SIZE];
        let mut transferred = 0u64;
        loop {
            if cancel.load(Ordering::Relaxed) {
                anyhow::bail!("{TRANSFER_CANCELLED}");
            }
            let n = source.read(&mut buf).await.context("read remote")?;
            if n == 0 {
                break;
            }
            sink.write_all(&buf[..n]).await.context("write local")?;
            transferred += n as u64;
            on_progress(transferred, total);
        }
        sink.shutdown().await.context("flush local")?;
        Ok(transferred)
    }
}

/// Sentinel string used as the error message when a transfer is cancelled
/// through the registry. The frontend matches on this exact value to render
/// the "cancelled" badge in the transfers list.
pub const TRANSFER_CANCELLED: &str = "cancelled";

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
