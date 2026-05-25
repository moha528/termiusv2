//! SSH client wrapper around `russh`.
//!
//! Exposes a high-level [`client::Session`] type with explicit lifecycle:
//! `connect → open_pty → write / read → close`.

pub mod client;
pub mod manager;
pub mod pty;

pub use client::{ConnectParams, KeyAuth, Session, SshError};
pub use manager::{new_entry, SessionEntry, SessionManager};
pub use pty::{PtyChannel, DEFAULT_TERM};
