//! SFTP client built on top of `russh-sftp`.
//!
//! The wrapper exposes a stable `SftpClient` type that hides russh-sftp's
//! own re-exports (`SftpSession`, `Metadata`, …) and converts results into
//! the shared `FileEntry` model.

mod client;

pub use client::SftpClient;
