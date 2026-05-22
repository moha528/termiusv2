//! In-memory registry of live SSH sessions.
//!
//! `SessionManager` owns the [`SessionEntry`] values for every open session.
//! It is registered as a Tauri `State` so command handlers can look up sessions
//! by UUID without having to thread channels through every call.

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::Result;
use tokio::sync::Mutex;
use uuid::Uuid;

use super::pty::PtyChannel;
use super::Session;

/// A live SSH session and its (optional) primary PTY.
///
/// We keep the session and PTY together so the manager can tear both down
/// atomically. Future tickets (split panes, SFTP) will add side channels
/// pointing back to the same `Arc<Session>` slot.
pub struct SessionEntry {
    pub id: Uuid,
    pub session: Session,
    pub pty: Option<PtyChannel>,
}

impl SessionEntry {
    pub fn new(id: Uuid, session: Session) -> Self {
        Self {
            id,
            session,
            pty: None,
        }
    }
}

/// Thread-safe map of [`SessionEntry`].
#[derive(Default, Clone)]
pub struct SessionManager {
    inner: Arc<Mutex<HashMap<Uuid, Arc<Mutex<SessionEntry>>>>>,
}

impl SessionManager {
    /// Insert `entry` and return its id.
    pub async fn insert(&self, entry: SessionEntry) -> Uuid {
        let id = entry.id;
        self.inner
            .lock()
            .await
            .insert(id, Arc::new(Mutex::new(entry)));
        id
    }

    /// Get a cloned `Arc` to the entry for `id`, if any.
    pub async fn get(&self, id: Uuid) -> Option<Arc<Mutex<SessionEntry>>> {
        self.inner.lock().await.get(&id).cloned()
    }

    /// List currently registered session ids.
    pub async fn list(&self) -> Vec<Uuid> {
        self.inner.lock().await.keys().copied().collect()
    }

    /// Remove the entry for `id`, returning it for cleanup.
    pub async fn remove(&self, id: Uuid) -> Option<Arc<Mutex<SessionEntry>>> {
        self.inner.lock().await.remove(&id)
    }

    /// Close every session and drop the registry contents. Best-effort:
    /// errors during close are logged but do not stop the loop.
    pub async fn close_all(&self) -> Result<()> {
        let drained: Vec<_> = self.inner.lock().await.drain().map(|(_, v)| v).collect();
        for entry in drained {
            let mut entry = entry.lock().await;
            if let Some(pty) = entry.pty.take() {
                if let Err(e) = pty.close().await {
                    tracing::warn!("close pty: {e}");
                }
            }
            // Move the session out by replacing with a placeholder is not
            // possible without `Default` on Session — we drop the entry,
            // which best-effort closes the russh handle.
        }
        Ok(())
    }
}

/// Convenience: spawn a fresh UUID v4 and wrap a session.
pub fn new_entry(session: Session) -> SessionEntry {
    SessionEntry::new(Uuid::new_v4(), session)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn empty_manager_lists_nothing() {
        let mgr = SessionManager::default();
        assert!(mgr.list().await.is_empty());
        assert!(mgr.get(Uuid::new_v4()).await.is_none());
    }

    #[tokio::test]
    async fn close_all_on_empty_is_noop() {
        let mgr = SessionManager::default();
        mgr.close_all().await.expect("close_all");
    }

    // Full insert/get/remove flow against a real `Session` is exercised by the
    // ignored Docker integration test in `commands::sessions::tests`.
}
