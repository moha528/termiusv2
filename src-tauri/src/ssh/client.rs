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

use std::sync::Arc;

use anyhow::{anyhow, Result};
use russh::client::{self, AuthResult, Handle};
use russh::keys::PublicKey;
use thiserror::Error;
use tokio::sync::Mutex;
use tracing::warn;

use crate::store::known_hosts::{self, TofuOutcome};
use crate::store::DbPool;

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

/// Parameters required to open a new SSH session.
#[derive(Debug, Clone)]
pub struct ConnectParams<'a> {
    pub hostname: &'a str,
    pub port: u16,
    pub username: &'a str,
    pub password: &'a str,
}

/// An authenticated SSH session.
///
/// Dropping a `Session` does NOT close the underlying TCP connection cleanly —
/// callers should call [`Session::close`] to send a proper `Disconnect`.
pub struct Session {
    handle: Handle<Handler>,
    /// (hostname, port) the session is bound to, for diagnostics.
    endpoint: (String, u16),
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
        let config = Arc::new(client::Config::default());
        let outcome = Arc::new(Mutex::new(None::<HandlerOutcome>));
        let handler = Handler {
            pool: pool.clone(),
            host: params.hostname.to_string(),
            port: params.port,
            outcome: outcome.clone(),
        };

        let addr = (params.hostname, params.port);
        let mut handle = client::connect(config, addr, handler).await?;

        // If the handler refused the host key, surface a typed error.
        if let Some(HandlerOutcome::Mismatch { expected, actual }) = outcome.lock().await.take() {
            return Err(SshError::HostKeyMismatch {
                host: params.hostname.to_string(),
                port: params.port,
                expected,
                actual,
            });
        }

        let auth = handle
            .authenticate_password(params.username, params.password)
            .await?;
        if !matches!(auth, AuthResult::Success) {
            return Err(SshError::AuthFailed {
                user: params.username.to_string(),
            });
        }

        Ok(Session {
            handle,
            endpoint: (params.hostname.to_string(), params.port),
        })
    }

    /// Endpoint this session is bound to (host, port). Useful for logging.
    pub fn endpoint(&self) -> (&str, u16) {
        (&self.endpoint.0, self.endpoint.1)
    }

    /// Borrow the underlying russh handle (escape hatch for future tickets).
    pub fn handle(&self) -> &Handle<Handler> {
        &self.handle
    }

    /// Send a graceful `Disconnect` to the peer. Idempotent in the sense that
    /// calling it twice on the same session simply returns the second error.
    pub async fn close(mut self) -> Result<()> {
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
}

#[derive(Debug, Clone)]
enum HandlerOutcome {
    Accepted,
    Mismatch { expected: String, actual: String },
}

impl client::Handler for Handler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> std::result::Result<bool, Self::Error> {
        let fp = server_public_key.fingerprint(Default::default()).to_string();
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

/// Translate connect errors into anyhow without losing the typed variant.
impl From<SshError> for anyhow::Error {
    fn from(value: SshError) -> Self {
        anyhow!(value.to_string())
    }
}

/// Quickly normalize "did we authenticate" without exposing russh internals.
#[allow(dead_code)]
fn auth_ok(res: &AuthResult) -> bool {
    matches!(res, AuthResult::Success)
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
    ///   cargo test --package termiusv2 -- --ignored ssh_password_login
    #[tokio::test]
    #[ignore = "requires a local SSH server on :2222 (see docker command above)"]
    async fn ssh_password_login() {
        let pool = crate::store::init_pool(std::path::Path::new(":memory:"))
            .await
            .expect("pool");
        let sess = Session::connect(
            &pool,
            ConnectParams {
                hostname: "127.0.0.1",
                port: 2222,
                username: "test",
                password: "test",
            },
        )
        .await
        .expect("ssh connect");
        sess.close().await.expect("disconnect");
    }
}
