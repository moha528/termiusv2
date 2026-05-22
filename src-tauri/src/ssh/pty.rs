//! PTY channel over an authenticated SSH session.
//!
//! A [`PtyChannel`] is a thin façade in front of an owned russh `Channel`
//! living inside a dedicated tokio task. Writes and resizes are sent to the
//! task through a command channel, and output bytes (stdout + stderr merged)
//! are forwarded to the caller through an unbounded mpsc receiver.
//!
//! This split is required because russh's `Channel::wait` borrows `&mut self`
//! while `Channel::data` borrows `&self`, so a shared-state design would need
//! a mutex on every write. Routing everything through a single task is both
//! simpler and avoids head-of-line blocking on writes.

use anyhow::{anyhow, Result};
use russh::client::Msg;
use russh::{Channel, ChannelMsg};
use tokio::sync::mpsc::{self, UnboundedReceiver, UnboundedSender};
use tokio::task::JoinHandle;
use tracing::warn;

/// Default terminal type advertised to the server.
pub const DEFAULT_TERM: &str = "xterm-256color";

/// Commands forwarded to the per-channel driver task.
#[derive(Debug)]
enum Cmd {
    Write(Vec<u8>),
    Resize { cols: u16, rows: u16 },
    Close,
}

/// Owning handle to a server-side PTY.
pub struct PtyChannel {
    cmd_tx: UnboundedSender<Cmd>,
    driver: Option<JoinHandle<()>>,
}

impl PtyChannel {
    /// Spawn the driver task. Returns the public handle and the byte receiver.
    pub(crate) fn spawn(channel: Channel<Msg>) -> (Self, UnboundedReceiver<Vec<u8>>) {
        let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
        let (data_tx, data_rx) = mpsc::unbounded_channel();
        let driver = tokio::spawn(drive(channel, cmd_rx, data_tx));
        (
            Self {
                cmd_tx,
                driver: Some(driver),
            },
            data_rx,
        )
    }

    /// Write raw bytes to the PTY (keyboard input).
    pub fn write(&self, data: &[u8]) -> Result<()> {
        self.cmd_tx
            .send(Cmd::Write(data.to_vec()))
            .map_err(|_| anyhow!("pty channel closed"))
    }

    /// Inform the server that the terminal was resized.
    pub fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        self.cmd_tx
            .send(Cmd::Resize { cols, rows })
            .map_err(|_| anyhow!("pty channel closed"))
    }

    /// Send EOF + close to the peer. Waits for the driver task to terminate.
    pub async fn close(mut self) -> Result<()> {
        // Best-effort: if the driver already exited, sending will error and
        // we just join.
        let _ = self.cmd_tx.send(Cmd::Close);
        if let Some(handle) = self.driver.take() {
            let _ = handle.await;
        }
        Ok(())
    }
}

impl Drop for PtyChannel {
    fn drop(&mut self) {
        if let Some(handle) = self.driver.take() {
            handle.abort();
        }
    }
}

/// Per-channel driver: multiplexes commands from the caller and bytes from
/// the SSH peer onto the right destination.
async fn drive(
    mut channel: Channel<Msg>,
    mut cmd_rx: UnboundedReceiver<Cmd>,
    data_tx: UnboundedSender<Vec<u8>>,
) {
    loop {
        tokio::select! {
            cmd = cmd_rx.recv() => match cmd {
                Some(Cmd::Write(buf)) => {
                    if let Err(e) = channel.data(&buf[..]).await {
                        warn!("pty write: {e}");
                        break;
                    }
                }
                Some(Cmd::Resize { cols, rows }) => {
                    if let Err(e) = channel
                        .window_change(cols as u32, rows as u32, 0, 0)
                        .await
                    {
                        warn!("pty resize: {e}");
                    }
                }
                Some(Cmd::Close) | None => break,
            },
            msg = channel.wait() => {
                let bytes = match msg {
                    Some(ChannelMsg::Data { ref data })
                    | Some(ChannelMsg::ExtendedData { ref data, .. }) => Some(data.to_vec()),
                    Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break,
                    _ => None,
                };
                if let Some(chunk) = bytes {
                    if data_tx.send(chunk).is_err() {
                        break;
                    }
                }
            }
        }
    }

    let _ = channel.eof().await;
    let _ = channel.close().await;
}
