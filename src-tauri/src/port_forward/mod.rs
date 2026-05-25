//! Runtime registry + workers for SSH port forwards.
//!
//! Each *active* forward owns:
//! 1. A dedicated [`crate::ssh::Session`] (so the forward survives even if
//!    every terminal tab to that host is closed).
//! 2. A `tokio::net::TcpListener` bound on `local_port` (for `-L`).
//! 3. A `tokio::sync::watch` shutdown signal observed by every spawned task.
//!
//! `ForwardRegistry` is the IPC-facing state holder. It is `app.manage()`d
//! alongside `SessionManager` so commands can start/stop forwards by id.

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;
use tokio::sync::{watch, Mutex};
use tracing::{info, warn};

use crate::ssh::Session;

mod socks5;

/// Handle to one running forward: holds the SSH session + shutdown signal.
/// Dropping the handle does not stop the workers — call `stop()` first.
pub struct RunningForward {
    /// `Some` until `stop()` consumes it.
    session: Option<Session>,
    shutdown_tx: watch::Sender<bool>,
    pub forward_type: ForwardKind,
    pub local_port: u16,
    pub remote: (String, u16),
}

/// Subset of `models::ForwardType` that we currently implement.
#[derive(Debug, Clone, Copy)]
pub enum ForwardKind {
    Local,
    Dynamic,
    Remote,
}

impl RunningForward {
    pub async fn stop(mut self) -> Result<()> {
        let _ = self.shutdown_tx.send(true);
        if let Some(sess) = self.session.take() {
            if let Err(e) = sess.close().await {
                warn!("close forward session: {e}");
            }
        }
        Ok(())
    }
}

#[derive(Default, Clone)]
pub struct ForwardRegistry {
    inner: Arc<Mutex<HashMap<String, RunningForward>>>,
}

impl ForwardRegistry {
    pub async fn insert(&self, id: String, forward: RunningForward) {
        self.inner.lock().await.insert(id, forward);
    }

    pub async fn remove(&self, id: &str) -> Option<RunningForward> {
        self.inner.lock().await.remove(id)
    }

    pub async fn is_active(&self, id: &str) -> bool {
        self.inner.lock().await.contains_key(id)
    }

    pub async fn active_ids(&self) -> Vec<String> {
        self.inner.lock().await.keys().cloned().collect()
    }

    /// Stop every active forward. Called when the vault locks so a forward
    /// (which keeps a live SSH session under the hood) doesn't survive past
    /// a security boundary. Errors on individual stops are logged but the
    /// loop keeps going — we want a best-effort clean state.
    pub async fn stop_all(&self) -> usize {
        let drained: Vec<(String, RunningForward)> = self.inner.lock().await.drain().collect();
        let count = drained.len();
        for (id, running) in drained {
            if let Err(e) = running.stop().await {
                tracing::warn!(forward = %id, error = %e, "stop_all: forward failed to stop");
            }
        }
        count
    }
}

/// Bind `local_port` on 127.0.0.1 and forward every incoming TCP connection
/// to `(remote_host, remote_port)` via the SSH `session`. Equivalent to
/// `ssh -L local_port:remote_host:remote_port`.
///
/// Returns a [`RunningForward`] that owns the listener task. The task exits
/// when either:
///   - `RunningForward::stop()` is called (shutdown signal flips to `true`)
///   - The TcpListener errors (e.g. socket closed externally)
///   - The SSH session dies
pub async fn start_local(
    session: Session,
    local_port: u16,
    remote_host: String,
    remote_port: u16,
) -> Result<RunningForward> {
    let bind_addr = format!("127.0.0.1:{local_port}");
    let listener = TcpListener::bind(&bind_addr)
        .await
        .with_context(|| format!("bind {bind_addr}"))?;
    info!(
        local = %bind_addr,
        remote = format!("{remote_host}:{remote_port}"),
        "local forward started"
    );

    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let session_handle = session.handle().clone();
    let remote_host_owned = remote_host.clone();

    tokio::spawn(async move {
        listener_loop(
            listener,
            session_handle,
            remote_host_owned,
            remote_port,
            shutdown_rx,
        )
        .await;
    });

    Ok(RunningForward {
        session: Some(session),
        shutdown_tx,
        forward_type: ForwardKind::Local,
        local_port,
        remote: (remote_host, remote_port),
    })
}

async fn listener_loop(
    listener: TcpListener,
    session_handle: Arc<russh::client::Handle<crate::ssh::client::Handler>>,
    remote_host: String,
    remote_port: u16,
    mut shutdown_rx: watch::Receiver<bool>,
) {
    loop {
        tokio::select! {
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    info!(remote = format!("{remote_host}:{remote_port}"), "local forward stopping");
                    return;
                }
            }
            res = listener.accept() => {
                match res {
                    Ok((stream, peer)) => {
                        let h = session_handle.clone();
                        let rh = remote_host.clone();
                        let mut sub_shutdown = shutdown_rx.clone();
                        tokio::spawn(async move {
                            if let Err(e) = bridge_one(stream, h, &rh, remote_port, &mut sub_shutdown).await {
                                warn!(peer = %peer, error = %e, "local forward bridge ended");
                            }
                        });
                    }
                    Err(e) => {
                        warn!("listener accept: {e}");
                        return;
                    }
                }
            }
        }
    }
}

/// Ask the SSH server to listen on `remote_bind_port` and forward every
/// inbound connection back through this session to `(local_host, local_port)`.
/// Equivalent to `ssh -R remote_bind_port:local_host:local_port`.
///
/// Unlike `start_local` we don't bind any local socket: the listening
/// happens on the server side. We just register the route with the Session
/// (so the Handler knows where to bridge inbound channels) and hold the
/// session for the lifetime of the forward.
pub async fn start_remote(
    session: Session,
    remote_bind_port: u16,
    local_host: String,
    local_port: u16,
) -> Result<RunningForward> {
    let remote_bind_addr = "127.0.0.1".to_string();
    session
        .request_remote_forward(
            &remote_bind_addr,
            remote_bind_port,
            local_host.clone(),
            local_port,
        )
        .await
        .with_context(|| format!("request -R {remote_bind_port}"))?;
    info!(
        remote_port = remote_bind_port,
        local = format!("{local_host}:{local_port}"),
        "remote forward started"
    );

    // No listener task — the server does the listening. The watch channel
    // is kept for API symmetry with the other variants.
    let (shutdown_tx, _shutdown_rx) = watch::channel(false);
    Ok(RunningForward {
        session: Some(session),
        shutdown_tx,
        forward_type: ForwardKind::Remote,
        local_port: remote_bind_port,
        remote: (local_host, local_port),
    })
}

/// Bind `local_port` on 127.0.0.1 as a SOCKS5 proxy that tunnels every
/// CONNECT request through the SSH `session`. Equivalent to `ssh -D`.
/// Only the unauthenticated CONNECT command is supported, which is what
/// every modern client (browsers, curl --socks5, ...) uses.
pub async fn start_dynamic(session: Session, local_port: u16) -> Result<RunningForward> {
    let bind_addr = format!("127.0.0.1:{local_port}");
    let listener = TcpListener::bind(&bind_addr)
        .await
        .with_context(|| format!("bind {bind_addr}"))?;
    info!(local = %bind_addr, "dynamic (SOCKS5) forward started");

    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let session_handle = session.handle().clone();

    tokio::spawn(async move {
        socks_listener_loop(listener, session_handle, shutdown_rx).await;
    });

    Ok(RunningForward {
        session: Some(session),
        shutdown_tx,
        forward_type: ForwardKind::Dynamic,
        local_port,
        remote: ("socks5".into(), 0),
    })
}

async fn socks_listener_loop(
    listener: TcpListener,
    session_handle: Arc<russh::client::Handle<crate::ssh::client::Handler>>,
    mut shutdown_rx: watch::Receiver<bool>,
) {
    loop {
        tokio::select! {
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    info!("dynamic forward stopping");
                    return;
                }
            }
            res = listener.accept() => {
                match res {
                    Ok((stream, peer)) => {
                        let h = session_handle.clone();
                        let mut sub_shutdown = shutdown_rx.clone();
                        tokio::spawn(async move {
                            if let Err(e) = socks5::handle_client(stream, h, &mut sub_shutdown).await {
                                warn!(peer = %peer, error = %e, "SOCKS5 client bridge ended");
                            }
                        });
                    }
                    Err(e) => {
                        warn!("SOCKS5 listener accept: {e}");
                        return;
                    }
                }
            }
        }
    }
}

/// Bridge one accepted TCP connection to a fresh direct-tcpip channel.
/// Bytes flow in both directions until either side EOFs or the shutdown
/// signal fires.
async fn bridge_one(
    mut stream: tokio::net::TcpStream,
    session: Arc<russh::client::Handle<crate::ssh::client::Handler>>,
    remote_host: &str,
    remote_port: u16,
    shutdown_rx: &mut watch::Receiver<bool>,
) -> Result<()> {
    let channel = session
        .channel_open_direct_tcpip(
            remote_host.to_string(),
            remote_port as u32,
            "127.0.0.1".to_string(),
            0,
        )
        .await
        .map_err(|e| anyhow!("open direct-tcpip: {e}"))?;
    let mut channel_stream = channel.into_stream();
    let (mut local_read, mut local_write) = stream.split();
    let (mut chan_read, mut chan_write) = tokio::io::split(&mut channel_stream);

    let local_to_remote = async {
        let r = tokio::io::copy(&mut local_read, &mut chan_write).await;
        let _ = chan_write.shutdown().await;
        r
    };
    let remote_to_local = async {
        let r = tokio::io::copy(&mut chan_read, &mut local_write).await;
        let _ = local_write.shutdown().await;
        r
    };

    tokio::select! {
        _ = shutdown_rx.changed() => Ok(()),
        res = local_to_remote => res.map(|_| ()).map_err(|e| anyhow!("local->remote copy: {e}")),
        res = remote_to_local => res.map(|_| ()).map_err(|e| anyhow!("remote->local copy: {e}")),
    }
}
