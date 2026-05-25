//! Thin SSH client built on top of `russh`.
//!
//! The current scope (ticket P1-T09) covers:
//! - TCP connect + password authentication
//! - Server fingerprint verification via the TOFU policy in
//!   [`crate::store::known_hosts`]
//! - Graceful disconnect
//!
//! Higher-level concerns (multiple PTYs per session, SFTP, port forwards) are
//! built on top of this module in subsequent tickets.

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use russh::client::{self, AuthResult, Handle};
use russh::keys::PublicKey;
use thiserror::Error;
use tokio::sync::Mutex;
use tracing::warn;

use crate::store::known_hosts::{self, TofuOutcome};
use crate::store::DbPool;

use super::pty::{self, PtyChannel};
use tokio::sync::mpsc::UnboundedReceiver;

/// `(remote_bind_addr, remote_bind_port)` → `(local_target_host, local_target_port)`.
/// Shared between [`Session`] (write side: registers routes) and [`Handler`]
/// (read side: dispatches inbound `forwarded-tcpip` channels).
type ForwardedRoutes = Arc<Mutex<HashMap<(String, u32), (String, u16)>>>;

/// Domain-specific SSH errors that are easier to match on than raw `anyhow`.
#[derive(Debug, Error)]
pub enum SshError {
    #[error("authentication failed for user '{user}'")]
    AuthFailed { user: String },
    #[error(
        "server fingerprint mismatch for {host}:{port} \
         (expected {expected}, got {actual}); refusing to connect"
    )]
    HostKeyMismatch {
        host: String,
        port: u16,
        expected: String,
        actual: String,
    },
    #[error("underlying SSH error: {0}")]
    Transport(#[from] russh::Error),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

/// A private key to try at auth time, with its (optional) passphrase. The
/// connection code iterates over these in order before falling back to
/// password auth.
#[derive(Debug, Clone)]
pub struct KeyAuth {
    pub private_key_path: String,
    pub passphrase: Option<String>,
}

/// Parameters required to open a new SSH session.
///
/// Auth is tried in this order:
///   1. each entry in `keys` (in the order given)
///   2. `password` if provided and non-empty
///
/// `AuthFailed` is returned only if every method fails.
#[derive(Debug, Clone)]
pub struct ConnectParams<'a> {
    pub hostname: &'a str,
    pub port: u16,
    pub username: &'a str,
    pub password: &'a str,
    pub keys: Vec<KeyAuth>,
    /// Enable SSH agent forwarding (P3-T14). When true, the Handler accepts
    /// `auth-agent@openssh.com` channel opens from the server and bridges
    /// them to the local SSH agent (UNIX socket or Windows named pipe).
    pub agent_forward: bool,
}

/// An authenticated SSH session.
///
/// Dropping a `Session` does NOT close the underlying TCP connection cleanly —
/// callers should call [`Session::close`] to send a proper `Disconnect`.
pub struct Session {
    /// `Arc` so background tasks (transfers, side-channels) can hold a strong
    /// reference without forcing a `Clone` impl on the russh `Handler`.
    handle: Arc<Handle<Handler>>,
    /// (hostname, port) the session is bound to, for diagnostics.
    endpoint: (String, u16),
    /// ProxyJump chain — when set, this session is tunneled through the
    /// bastion held here. Drop order: this session's `handle` drops first
    /// (the direct-tcpip channel closes), then the bastion's, then the TCP
    /// connection to the bastion. That ordering matters: we must let the
    /// inner channel close cleanly before tearing the transport down.
    #[allow(dead_code)]
    bastion: Option<Box<Session>>,
    /// Routes for `-R` (remote) port forwards: `(remote_bind_addr,
    /// remote_bind_port)` → local target the Handler should bridge incoming
    /// `forwarded-tcpip` channels to. Shared `Arc` with the Handler so we
    /// can register/unregister routes from outside the russh internal loop.
    forwarded_routes: ForwardedRoutes,
}

impl Session {
    /// Open a new SSH session against `params`.
    ///
    /// The server's public key is validated against the local TOFU store
    /// ([`crate::store::known_hosts`]). On first encounter the fingerprint is
    /// recorded; on subsequent connections any change triggers
    /// [`SshError::HostKeyMismatch`].
    pub async fn connect(
        pool: &DbPool,
        params: ConnectParams<'_>,
    ) -> std::result::Result<Self, SshError> {
        let (config, handler, outcome, routes) = build_client(pool, &params);
        let addr = (params.hostname, params.port);
        let handle = client::connect(config, addr, handler).await?;
        let endpoint = (params.hostname.to_string(), params.port);
        Self::finish_handshake(handle, outcome, routes, params, endpoint, None).await
    }

    /// Open a session **tunneled through `bastion`** (ProxyJump). We open a
    /// `direct-tcpip` channel on the bastion and run the SSH handshake of
    /// the target on top of that channel's byte stream.
    ///
    /// The bastion session is moved into the returned `Session` so its
    /// lifetime exactly matches the tunnel. Dropping the target session
    /// drops its handle, which closes the direct-tcpip channel, then drops
    /// the bastion.
    pub async fn connect_via_bastion(
        pool: &DbPool,
        bastion: Session,
        params: ConnectParams<'_>,
    ) -> std::result::Result<Self, SshError> {
        let (config, handler, outcome, routes) = build_client(pool, &params);
        let channel = bastion
            .handle
            .channel_open_direct_tcpip(
                params.hostname.to_string(),
                params.port as u32,
                "127.0.0.1".to_string(),
                0,
            )
            .await
            .map_err(|e| {
                SshError::Other(anyhow!("open direct-tcpip via {}: {e}", bastion.endpoint.0))
            })?;
        let stream = channel.into_stream();
        let handle = client::connect_stream(config, stream, handler).await?;
        let endpoint = (params.hostname.to_string(), params.port);
        Self::finish_handshake(
            handle,
            outcome,
            routes,
            params,
            endpoint,
            Some(Box::new(bastion)),
        )
        .await
    }

    /// Shared tail of `connect` + `connect_via_bastion`: TOFU verification,
    /// publickey + password auth, wrapping into a `Session`.
    async fn finish_handshake(
        mut handle: Handle<Handler>,
        outcome: Arc<Mutex<Option<HandlerOutcome>>>,
        forwarded_routes: ForwardedRoutes,
        params: ConnectParams<'_>,
        endpoint: (String, u16),
        bastion: Option<Box<Session>>,
    ) -> std::result::Result<Self, SshError> {
        // If the handler refused the host key, surface a typed error.
        if let Some(HandlerOutcome::Mismatch { expected, actual }) = outcome.lock().await.take() {
            return Err(SshError::HostKeyMismatch {
                host: params.hostname.to_string(),
                port: params.port,
                expected,
                actual,
            });
        }

        // 1) Try each provided key in order. We swallow individual key errors
        //    (file missing, wrong passphrase, server refused this key) so that
        //    one bad key doesn't prevent the next from being attempted.
        let mut authenticated = false;
        for key in &params.keys {
            match try_publickey_auth(&mut handle, params.username, key).await {
                Ok(true) => {
                    authenticated = true;
                    break;
                }
                Ok(false) => continue,
                Err(e) => {
                    warn!(path = %key.private_key_path, error = %e, "key auth attempt failed");
                    continue;
                }
            }
        }

        // 2) Fall back to password auth if a password was provided.
        if !authenticated && !params.password.is_empty() {
            let auth = handle
                .authenticate_password(params.username, params.password)
                .await?;
            if matches!(auth, AuthResult::Success) {
                authenticated = true;
            }
        }

        if !authenticated {
            return Err(SshError::AuthFailed {
                user: params.username.to_string(),
            });
        }

        Ok(Session {
            handle: Arc::new(handle),
            endpoint,
            bastion,
            forwarded_routes,
        })
    }

    /// Endpoint this session is bound to (host, port). Useful for logging.
    pub fn endpoint(&self) -> (&str, u16) {
        (&self.endpoint.0, self.endpoint.1)
    }

    /// Open a PTY-backed shell channel of size `cols`×`rows`. Returns a handle
    /// for input/resize and a receiver for the merged stdout/stderr stream.
    ///
    /// `agent_forward`: if true, sends an `auth-agent-req@openssh.com` request
    /// on the channel so the remote side knows it can open back-channels to
    /// our local SSH agent (the actual bridging is done by [`Handler`]).
    pub async fn open_pty(
        &self,
        cols: u16,
        rows: u16,
        agent_forward: bool,
    ) -> std::result::Result<(PtyChannel, UnboundedReceiver<Vec<u8>>), SshError> {
        let channel = self.handle.channel_open_session().await?;
        channel
            .request_pty(
                false,
                pty::DEFAULT_TERM,
                cols as u32,
                rows as u32,
                0,
                0,
                &[],
            )
            .await?;
        if agent_forward {
            // `want_reply = false` matches OpenSSH's behaviour. If the server
            // doesn't support agent forwarding the request is silently ignored.
            channel.agent_forward(false).await?;
        }
        channel.request_shell(false).await?;
        Ok(PtyChannel::spawn(channel))
    }

    /// Borrow the underlying russh handle. Returns `&Arc<...>` so callers
    /// can either deref to `&Handle` or `.clone()` the `Arc` for background
    /// tasks (file transfers, secondary channels) that outlive the lock.
    pub fn handle(&self) -> &Arc<Handle<Handler>> {
        &self.handle
    }

    /// Ask the server to listen on `remote_bind_addr:remote_bind_port` and
    /// forward every connection back through this SSH session. The Handler
    /// will route each inbound `forwarded-tcpip` channel to
    /// `(local_host, local_port)`. Equivalent to `ssh -R`.
    pub async fn request_remote_forward(
        &self,
        remote_bind_addr: &str,
        remote_bind_port: u16,
        local_host: String,
        local_port: u16,
    ) -> Result<()> {
        // Register the route before asking the server to listen so we're
        // ready when the very first connection arrives.
        self.forwarded_routes.lock().await.insert(
            (remote_bind_addr.to_string(), remote_bind_port as u32),
            (local_host, local_port),
        );
        self.handle
            .tcpip_forward(remote_bind_addr, remote_bind_port as u32)
            .await
            .map_err(|e| anyhow!("tcpip-forward request: {e}"))?;
        Ok(())
    }

    /// Send a graceful `Disconnect` to the peer.
    pub async fn close(self) -> Result<()> {
        self.handle
            .disconnect(russh::Disconnect::ByApplication, "bye", "en")
            .await
            .map_err(|e| anyhow!("disconnect: {e}"))?;
        Ok(())
    }
}

/// Internal handler that mediates the TOFU check during the SSH handshake.
pub struct Handler {
    pool: DbPool,
    host: String,
    port: u16,
    outcome: Arc<Mutex<Option<HandlerOutcome>>>,
    /// When true, agent-forward channels pushed by the server are accepted
    /// and bridged to the local SSH agent. The Handler is per-session, so
    /// only sessions that requested agent forwarding will respond.
    agent_forward: bool,
    /// Shared with `Session::forwarded_routes` so [`Session::request_remote_forward`]
    /// can register destinations the Handler will route to when the server
    /// pushes an inbound `forwarded-tcpip` channel.
    forwarded_routes: ForwardedRoutes,
}

#[derive(Debug, Clone)]
enum HandlerOutcome {
    Accepted,
    Mismatch { expected: String, actual: String },
}

impl client::Handler for Handler {
    type Error = russh::Error;

    /// Route `forwarded-tcpip` channels pushed by the server (i.e. a remote
    /// `-R` forward) to the local target we registered in [`Session::request_remote_forward`].
    ///
    /// If no route matches `(connected_address, connected_port)` we drop the
    /// channel (russh sends a clean refusal back to the server). This means a
    /// rogue server can't blindly open TCP back-channels to arbitrary local
    /// addresses — they're only accepted for bindings *we* explicitly asked for.
    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: russh::Channel<russh::client::Msg>,
        connected_address: &str,
        connected_port: u32,
        _originator_address: &str,
        _originator_port: u32,
        _session: &mut russh::client::Session,
    ) -> std::result::Result<(), Self::Error> {
        let key = (connected_address.to_string(), connected_port);
        let target = self.forwarded_routes.lock().await.get(&key).cloned();
        let Some((local_host, local_port)) = target else {
            warn!(
                "forwarded-tcpip from {connected_address}:{connected_port} — no matching route, dropping"
            );
            drop(channel);
            return Ok(());
        };
        tokio::spawn(async move {
            if let Err(e) = run_remote_forward_bridge(channel, local_host, local_port).await {
                warn!("forwarded-tcpip bridge: {e}");
            }
        });
        Ok(())
    }

    /// Accept the `auth-agent@openssh.com` channel pushed by the server
    /// and bridge it to the local SSH agent socket. Only triggers when the
    /// session was opened with `agent_forward: true`.
    ///
    /// In russh 0.61 the trait does not return an accept/reject decision —
    /// instead the callback owns the `Channel<Msg>`: keeping it alive keeps
    /// the channel open, dropping it closes it. We move the channel into a
    /// dedicated bridge task on accept and just let it drop on refuse.
    async fn server_channel_open_agent_forward(
        &mut self,
        channel: russh::Channel<russh::client::Msg>,
        _session: &mut russh::client::Session,
    ) -> std::result::Result<(), Self::Error> {
        if !self.agent_forward {
            // Drop the channel — russh sends the SSH_OPEN_CONNECT_FAILED
            // back to the server which then surfaces a clean "no agent"
            // error to `ssh-add` and friends.
            drop(channel);
            return Ok(());
        }
        tokio::spawn(async move {
            if let Err(e) = run_agent_bridge(channel).await {
                tracing::warn!("agent forward bridge: {e}");
            }
        });
        Ok(())
    }

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> std::result::Result<bool, Self::Error> {
        let fp = server_public_key
            .fingerprint(Default::default())
            .to_string();
        let algo = server_public_key.algorithm().as_str().to_string();

        match known_hosts::verify_or_record(&self.pool, &self.host, self.port, &fp, &algo).await {
            Ok(TofuOutcome::FirstSeen) | Ok(TofuOutcome::Match) => {
                *self.outcome.lock().await = Some(HandlerOutcome::Accepted);
                Ok(true)
            }
            Ok(TofuOutcome::Mismatch { expected }) => {
                warn!(
                    host = %self.host,
                    port = self.port,
                    %expected,
                    actual = %fp,
                    "TOFU mismatch — refusing connection"
                );
                *self.outcome.lock().await = Some(HandlerOutcome::Mismatch {
                    expected,
                    actual: fp,
                });
                // Returning false tells russh to abort the handshake.
                Ok(false)
            }
            Err(e) => {
                warn!(error = %e, "TOFU storage error — refusing connection");
                Err(russh::Error::SendError)
            }
        }
    }
}

/// Quickly normalize "did we authenticate" without exposing russh internals.
#[allow(dead_code)]
fn auth_ok(res: &AuthResult) -> bool {
    matches!(res, AuthResult::Success)
}

/// Bridge a server-pushed `forwarded-tcpip` channel to a local TCP target.
/// Used for `-R` remote port forwards.
async fn run_remote_forward_bridge(
    channel: russh::Channel<russh::client::Msg>,
    local_host: String,
    local_port: u16,
) -> Result<()> {
    let mut local = tokio::net::TcpStream::connect((local_host.as_str(), local_port))
        .await
        .map_err(|e| anyhow!("connect local target {local_host}:{local_port}: {e}"))?;
    let mut chan_stream = channel.into_stream();
    tokio::io::copy_bidirectional(&mut chan_stream, &mut local)
        .await
        .map_err(|e| anyhow!("remote forward copy: {e}"))?;
    Ok(())
}

/// Pipe a russh channel (an `auth-agent@openssh.com` opened by the server)
/// bidirectionally against the local SSH agent socket.
async fn run_agent_bridge(channel: russh::Channel<russh::client::Msg>) -> Result<()> {
    let mut chan_stream = channel.into_stream();
    let mut agent = connect_local_agent().await?;
    tokio::io::copy_bidirectional(&mut chan_stream, &mut agent)
        .await
        .map_err(|e| anyhow!("agent bridge copy: {e}"))?;
    Ok(())
}

#[cfg(unix)]
async fn connect_local_agent() -> Result<tokio::net::UnixStream> {
    let sock = std::env::var("SSH_AUTH_SOCK").map_err(|_| anyhow!("SSH_AUTH_SOCK is not set"))?;
    tokio::net::UnixStream::connect(&sock)
        .await
        .map_err(|e| anyhow!("connect agent at {sock}: {e}"))
}

#[cfg(windows)]
async fn connect_local_agent() -> Result<tokio::net::windows::named_pipe::NamedPipeClient> {
    use tokio::net::windows::named_pipe::ClientOptions;
    // OpenSSH for Windows exposes the agent here. Pageant uses a different
    // mechanism (shared memory) and is intentionally unsupported.
    ClientOptions::new()
        .open(r"\\.\pipe\openssh-ssh-agent")
        .map_err(|e| anyhow!("connect Windows ssh-agent named pipe: {e}"))
}

/// Build the `(Config, Handler, outcome_slot)` triple shared by direct and
/// bastion-tunneled connections.
fn build_client(
    pool: &DbPool,
    params: &ConnectParams<'_>,
) -> (
    Arc<client::Config>,
    Handler,
    Arc<Mutex<Option<HandlerOutcome>>>,
    ForwardedRoutes,
) {
    let config = Arc::new(client::Config::default());
    let outcome = Arc::new(Mutex::new(None::<HandlerOutcome>));
    let forwarded_routes = Arc::new(Mutex::new(HashMap::new()));
    let handler = Handler {
        pool: pool.clone(),
        host: params.hostname.to_string(),
        port: params.port,
        outcome: outcome.clone(),
        agent_forward: params.agent_forward,
        forwarded_routes: forwarded_routes.clone(),
    };
    (config, handler, outcome, forwarded_routes)
}

/// Load `key` from disk and submit it as a publickey auth attempt.
/// Returns `Ok(true)` on `AuthResult::Success`, `Ok(false)` if the server
/// rejected the key (continue with the next one), and `Err` for transport
/// or filesystem errors that should be logged.
async fn try_publickey_auth(
    handle: &mut Handle<Handler>,
    username: &str,
    key: &KeyAuth,
) -> Result<bool> {
    use russh::keys::PrivateKeyWithHashAlg;
    let secret = russh::keys::load_secret_key(&key.private_key_path, key.passphrase.as_deref())
        .map_err(|e| anyhow!("load secret key {}: {e}", key.private_key_path))?;
    // For RSA keys, prefer SHA-256 — modern servers reject SHA-1. None for
    // other algorithms (ed25519, ecdsa).
    let hash_alg = match secret.algorithm() {
        russh::keys::Algorithm::Rsa { .. } => Some(russh::keys::HashAlg::Sha256),
        _ => None,
    };
    let key_with_hash = PrivateKeyWithHashAlg::new(Arc::new(secret), hash_alg);
    let auth = handle
        .authenticate_publickey(username, key_with_hash)
        .await
        .map_err(|e| anyhow!("publickey auth: {e}"))?;
    Ok(matches!(auth, AuthResult::Success))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Hard sanity check that the public surface compiles with the expected types.
    #[allow(dead_code)]
    fn type_signatures_compile() {
        fn _check(s: Session) -> (String, u16) {
            let (h, p) = s.endpoint();
            (h.to_string(), p)
        }
    }

    /// Integration test — requires a local SSH server. Run with:
    ///   docker run --rm -d -p 2222:2222 \
    ///     -e USER_NAME=test -e USER_PASSWORD=test \
    ///     -e PASSWORD_ACCESS=true \
    ///     linuxserver/openssh-server
    ///   cargo test --package lynk -- --ignored ssh_password_login
    #[tokio::test]
    #[ignore = "requires a local SSH server on :2222 (see docker command above)"]
    async fn ssh_password_login() {
        let pool = test_pool().await;
        let sess = Session::connect(&pool, sample_params())
            .await
            .expect("ssh connect");
        sess.close().await.expect("disconnect");
    }

    /// P1-T10 DoD: write "echo hello\n" through a PTY and read "hello" back.
    #[tokio::test]
    #[ignore = "requires a local SSH server on :2222 (see docker command above)"]
    async fn pty_echo_round_trip() {
        let pool = test_pool().await;
        let sess = Session::connect(&pool, sample_params())
            .await
            .expect("ssh connect");

        let (pty, mut rx) = sess.open_pty(80, 24, false).await.expect("open pty");
        pty.write(b"echo hello\n").expect("write");

        // Collect output for up to 5s — the shell may print a prompt + the echo.
        let mut acc = Vec::new();
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
        while tokio::time::Instant::now() < deadline {
            match tokio::time::timeout(std::time::Duration::from_millis(200), rx.recv()).await {
                Ok(Some(chunk)) => acc.extend_from_slice(&chunk),
                Ok(None) => break,
                Err(_) => {}
            }
            if String::from_utf8_lossy(&acc).contains("hello") {
                break;
            }
        }

        assert!(
            String::from_utf8_lossy(&acc).contains("hello"),
            "expected 'hello' in PTY output, got {:?}",
            String::from_utf8_lossy(&acc)
        );

        pty.close().await.expect("close pty");
        sess.close().await.expect("disconnect");
    }

    async fn test_pool() -> DbPool {
        let tmp = tempfile::Builder::new()
            .suffix(".sqlite")
            .tempfile()
            .expect("tmp file");
        let path = tmp.path().to_path_buf();
        drop(tmp);
        crate::store::init_pool(&path).await.expect("pool")
    }

    fn sample_params() -> ConnectParams<'static> {
        ConnectParams {
            hostname: "127.0.0.1",
            port: 2222,
            username: "test",
            password: "test",
            keys: Vec::new(),
            agent_forward: false,
        }
    }
}
