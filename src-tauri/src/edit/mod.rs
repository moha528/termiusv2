//! Live "edit a remote file in the local editor" pipeline.
//!
//! The flow:
//! 1. The user picks "Edit" on a remote file in the SFTP pane.
//! 2. Backend downloads the file into the app-data dir and opens it with the
//!    OS-default editor through `tauri-plugin-opener`.
//! 3. A background poll-based watcher checks the local file's mtime every
//!    500 ms. Any modification triggers a re-upload to the same remote path.
//! 4. The frontend receives `edit-saved-{id}` events with the new size +
//!    timestamp and surfaces a small "Synced" toast.
//!
//! We use a poll-based watcher (rather than `notify`) because we only watch
//! one file at a time and we already have a tokio runtime — this avoids a
//! transitive dep and a sync/async bridge.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use tokio::sync::Mutex;

/// One running edit session. Drop the `cancel` flag (or call
/// [`EditRegistry::cancel`]) to stop the watcher and free the entry.
pub struct EditEntry {
    pub edit_id: String,
    pub session_id: String,
    pub remote_path: String,
    pub local_path: PathBuf,
    pub cancel: Arc<AtomicBool>,
}

#[derive(Default, Clone)]
pub struct EditRegistry {
    inner: Arc<Mutex<HashMap<String, EditEntry>>>,
}

impl EditRegistry {
    pub async fn register(&self, entry: EditEntry) {
        self.inner.lock().await.insert(entry.edit_id.clone(), entry);
    }

    /// Mark the edit as cancelled and remove it from the registry. The
    /// watcher task checks the flag between polls and exits cleanly.
    pub async fn cancel(&self, id: &str) -> bool {
        let mut map = self.inner.lock().await;
        if let Some(entry) = map.remove(id) {
            entry
                .cancel
                .store(true, std::sync::atomic::Ordering::Relaxed);
            true
        } else {
            false
        }
    }
}
