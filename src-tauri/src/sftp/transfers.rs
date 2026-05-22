//! Registry tracking in-flight SFTP transfers so the frontend can cancel them.
//!
//! Each transfer registers an `Arc<AtomicBool>` on creation; the worker task
//! checks the flag between chunks. Cancellation is therefore graceful (clean
//! file descriptors, no panic) and best-effort (chunks already in flight
//! complete before the abort takes effect).

use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use tokio::sync::Mutex;

#[derive(Default, Clone)]
pub struct TransferRegistry {
    inner: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl TransferRegistry {
    /// Add a new transfer to the registry and return the cancel flag the
    /// worker should poll.
    pub async fn register(&self, transfer_id: String) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.inner.lock().await.insert(transfer_id, flag.clone());
        flag
    }

    /// Mark a transfer as cancelled. Returns `true` when the id was known.
    pub async fn cancel(&self, transfer_id: &str) -> bool {
        let map = self.inner.lock().await;
        if let Some(flag) = map.get(transfer_id) {
            flag.store(true, std::sync::atomic::Ordering::Relaxed);
            true
        } else {
            false
        }
    }

    /// Remove a transfer entry once it's done. Idempotent.
    pub async fn unregister(&self, transfer_id: &str) {
        self.inner.lock().await.remove(transfer_id);
    }
}
