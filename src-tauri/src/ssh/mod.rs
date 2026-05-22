//! SSH client wrapper around `russh`.
//!
//! Exposes a high-level [`client::Session`] type with explicit lifecycle:
//! `connect → open_pty → write / read → close`.

pub mod client;

pub use client::{Session, SshError};
