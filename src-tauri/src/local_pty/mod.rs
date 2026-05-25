//! Local pseudo-terminal sessions.
//!
//! Unlike SSH sessions, a "local" session is a child shell process attached
//! to a PTY on the host machine. We pick `pwsh` / `powershell` / `cmd` on
//! Windows and `$SHELL` (fallback `bash`) elsewhere.
//!
//! The wire protocol is identical to SSH sessions on purpose: the same
//! `terminal-data-{id}` and `session-closed-{id}` events are emitted, so
//! [`crate::components::TerminalView`] on the front does not need to know
//! which kind of backend drives the terminal.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;

/// One live local terminal: PTY master + child handle + writer used by
/// `send_input`. The reader is consumed by a background task that publishes
/// bytes through `mpsc::Receiver<Vec<u8>>`.
pub struct LocalSession {
    master: Box<dyn MasterPty + Send>,
    /// Held so the child process is killed when the session is closed.
    child: Box<dyn portable_pty::Child + Send + Sync>,
    writer: Box<dyn Write + Send>,
}

impl LocalSession {
    /// Spawn a shell in a fresh PTY, sized at `cols` x `rows`. Returns the
    /// session + the `Receiver` end of the byte stream.
    pub fn spawn(
        shell: Option<&str>,
        cols: u16,
        rows: u16,
    ) -> Result<(Self, mpsc::Receiver<Vec<u8>>)> {
        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize {
                cols,
                rows,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("openpty")?;

        let cmd = build_command(shell);
        let child = pair.slave.spawn_command(cmd).context("spawn_command")?;
        drop(pair.slave); // close the slave handle on this side

        let mut reader = pair.master.try_clone_reader().context("clone pty reader")?;
        let writer = pair.master.take_writer().context("take pty writer")?;

        let (tx, rx) = mpsc::channel::<Vec<u8>>(64);
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if tx.blocking_send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        tracing::warn!("local pty read: {e}");
                        break;
                    }
                }
            }
        });

        Ok((
            Self {
                master: pair.master,
                child,
                writer,
            },
            rx,
        ))
    }

    pub fn write(&mut self, data: &[u8]) -> Result<()> {
        self.writer.write_all(data).context("write to pty")?;
        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        self.master
            .resize(PtySize {
                cols,
                rows,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| anyhow!("resize pty: {e}"))?;
        Ok(())
    }

    pub fn kill(&mut self) -> Result<()> {
        // Best-effort: SIGTERM/equivalent.
        let _ = self.child.kill();
        let _ = self.child.wait();
        Ok(())
    }
}

/// Default shell selection: `$SHELL` on Unix, `pwsh` then `cmd` on Windows.
fn build_command(shell: Option<&str>) -> CommandBuilder {
    let explicit = shell.map(|s| s.to_string());
    let resolved = explicit.unwrap_or_else(|| {
        if cfg!(windows) {
            // pwsh is the modern PowerShell; if missing the user can override.
            // The PATH on Windows usually has cmd.exe as a guaranteed fallback.
            if which_in_path("pwsh.exe").is_some() {
                "pwsh.exe".into()
            } else if which_in_path("powershell.exe").is_some() {
                "powershell.exe".into()
            } else {
                "cmd.exe".into()
            }
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into())
        }
    });

    let mut cmd = CommandBuilder::new(&resolved);
    if let Ok(home) = std::env::var("HOME") {
        cmd.cwd(home);
    } else if let Ok(userprofile) = std::env::var("USERPROFILE") {
        cmd.cwd(userprofile);
    }
    cmd.env("TERM", "xterm-256color");
    cmd
}

/// Minimal which() replacement — checks PATH for `name`.
fn which_in_path(name: &str) -> Option<std::path::PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Registry of live local sessions keyed by UUID.
#[derive(Default, Clone)]
pub struct LocalSessionManager {
    inner: Arc<Mutex<HashMap<Uuid, Arc<Mutex<LocalSession>>>>>,
}

impl LocalSessionManager {
    pub async fn insert(&self, session: LocalSession) -> Uuid {
        let id = Uuid::new_v4();
        self.inner
            .lock()
            .await
            .insert(id, Arc::new(Mutex::new(session)));
        id
    }

    pub async fn get(&self, id: Uuid) -> Option<Arc<Mutex<LocalSession>>> {
        self.inner.lock().await.get(&id).cloned()
    }

    pub async fn remove(&self, id: Uuid) -> Option<Arc<Mutex<LocalSession>>> {
        self.inner.lock().await.remove(&id)
    }
}
