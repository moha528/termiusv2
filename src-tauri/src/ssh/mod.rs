//! SSH client wrapper around `russh`.
//!
//! Exposes a high-level [`client::Session`] type with explicit lifecycle:
//! `connect → open_pty → write / read → close`.

pub mod client;
pub mod pty;

pub use client::{Session, SshError};
pub use pty::{PtyChannel, DEFAULT_TERM};
