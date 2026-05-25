//! Per-session input buffer that detects "completed commands" so they can
//! be stored in `command_history` (P4-T03).
//!
//! This is intentionally *naïve*: we accumulate bytes per session, flush on
//! `\r` or `\n`, drop ESC sequences (cursor keys, function keys…), apply
//! basic backspace handling, and forget the buffer on Ctrl-C. It misses
//! readline tricks (Ctrl-A, Ctrl-K, history recall returning `\r`) but
//! catches >90% of the typing path which is what the user expects from a
//! Ctrl-R style history finder.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

/// Per-session in-progress input line.
#[derive(Default)]
pub struct CommandCapture {
    buffers: Arc<Mutex<HashMap<Uuid, String>>>,
}

impl CommandCapture {
    /// Feed a chunk of input bytes for `session_id`. Returns the list of
    /// completed commands (every line terminator flushes one).
    pub async fn feed(&self, session_id: Uuid, data: &str) -> Vec<String> {
        let mut completed = Vec::<String>::new();
        let mut guard = self.buffers.lock().await;
        let buf = guard.entry(session_id).or_default();

        for ch in data.chars() {
            match ch {
                '\r' | '\n' => {
                    if !buf.is_empty() {
                        completed.push(std::mem::take(buf));
                    }
                }
                '\x08' | '\x7f' => {
                    // BS / DEL → drop last char if any
                    buf.pop();
                }
                '\x03' | '\x04' => {
                    // Ctrl-C / Ctrl-D → drop the current draft
                    buf.clear();
                }
                '\x1b' => {
                    // ESC starts an arrow / fn-key sequence; the front
                    // pushes the whole CSI sequence as one chunk. Best
                    // effort: drop the rest of the chunk.
                    break;
                }
                c if c.is_control() => {
                    // Ignore other control bytes (tab, etc.) — they don't
                    // map to "what the user typed" in a useful way.
                }
                c => buf.push(c),
            }
        }
        completed
    }

    /// Drop the buffer associated with `session_id` (called on close).
    pub async fn forget(&self, session_id: Uuid) {
        self.buffers.lock().await.remove(&session_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn flushes_on_newline() {
        let cap = CommandCapture::default();
        let id = Uuid::new_v4();
        assert!(cap.feed(id, "l").await.is_empty());
        assert!(cap.feed(id, "s").await.is_empty());
        let done = cap.feed(id, "\r").await;
        assert_eq!(done, vec!["ls"]);
    }

    #[tokio::test]
    async fn backspace_removes_last() {
        let cap = CommandCapture::default();
        let id = Uuid::new_v4();
        cap.feed(id, "ls").await;
        cap.feed(id, "\x7f").await;
        let done = cap.feed(id, "\r").await;
        assert_eq!(done, vec!["l"]);
    }

    #[tokio::test]
    async fn ctrl_c_drops_buffer() {
        let cap = CommandCapture::default();
        let id = Uuid::new_v4();
        cap.feed(id, "rm -rf /").await;
        cap.feed(id, "\x03").await;
        let done = cap.feed(id, "\r").await;
        assert!(done.is_empty(), "buffer should be empty after Ctrl-C");
    }

    #[tokio::test]
    async fn escape_sequence_ignored() {
        let cap = CommandCapture::default();
        let id = Uuid::new_v4();
        cap.feed(id, "ls").await;
        cap.feed(id, "\x1b[A").await; // up arrow
        let done = cap.feed(id, "\r").await;
        assert_eq!(done, vec!["ls"]);
    }

    #[tokio::test]
    async fn multiple_commands_in_one_chunk() {
        let cap = CommandCapture::default();
        let id = Uuid::new_v4();
        let done = cap.feed(id, "ls\rpwd\r").await;
        assert_eq!(done, vec!["ls", "pwd"]);
    }

    #[tokio::test]
    async fn forget_isolates_sessions() {
        let cap = CommandCapture::default();
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        cap.feed(a, "ls").await;
        cap.feed(b, "pwd").await;
        cap.forget(a).await;
        let done = cap.feed(a, "\r").await;
        assert!(done.is_empty());
        let done = cap.feed(b, "\r").await;
        assert_eq!(done, vec!["pwd"]);
    }
}
