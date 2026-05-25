//! Minimal SOCKS5 server implementation, just enough to support
//! `ssh -D` semantics. Scope:
//!   - SOCKS version 5 only (no v4 fallback)
//!   - "No authentication" method only (method 0x00)
//!   - CONNECT command only (no BIND, no UDP ASSOCIATE)
//!   - Domain (0x03), IPv4 (0x01) and IPv6 (0x04) address types
//!
//! Reference: RFC 1928.

use std::sync::Arc;

use anyhow::{anyhow, Result};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::watch;

use crate::ssh::client::Handler;

/// SOCKS5 atyp values.
const ATYP_IPV4: u8 = 0x01;
const ATYP_DOMAIN: u8 = 0x03;
const ATYP_IPV6: u8 = 0x04;

/// Drive the SOCKS5 handshake on `stream`, then bridge bytes between the
/// client and a fresh direct-tcpip channel toward the negotiated target.
pub async fn handle_client(
    mut stream: TcpStream,
    session: Arc<russh::client::Handle<Handler>>,
    shutdown_rx: &mut watch::Receiver<bool>,
) -> Result<()> {
    // === Method negotiation ===
    // Client: [ver, nmethods, methods...]
    let mut hdr = [0u8; 2];
    stream.read_exact(&mut hdr).await?;
    if hdr[0] != 0x05 {
        return Err(anyhow!("unsupported SOCKS version {}", hdr[0]));
    }
    let nmethods = hdr[1] as usize;
    let mut methods = vec![0u8; nmethods];
    stream.read_exact(&mut methods).await?;
    if !methods.contains(&0x00) {
        // No acceptable auth method.
        stream.write_all(&[0x05, 0xFF]).await?;
        return Err(anyhow!("client does not support no-auth"));
    }
    stream.write_all(&[0x05, 0x00]).await?;

    // === Connect request ===
    // Client: [ver, cmd, rsv, atyp, addr..., port]
    let mut req = [0u8; 4];
    stream.read_exact(&mut req).await?;
    if req[0] != 0x05 {
        return Err(anyhow!("unexpected SOCKS version in request"));
    }
    if req[1] != 0x01 {
        // Only CONNECT (0x01). Reply with "command not supported" (0x07).
        reply(&mut stream, 0x07).await?;
        return Err(anyhow!("unsupported SOCKS command {}", req[1]));
    }
    let atyp = req[3];
    let (host, port) = match atyp {
        ATYP_IPV4 => {
            let mut octets = [0u8; 4];
            stream.read_exact(&mut octets).await?;
            let mut port = [0u8; 2];
            stream.read_exact(&mut port).await?;
            (
                std::net::Ipv4Addr::from(octets).to_string(),
                u16::from_be_bytes(port),
            )
        }
        ATYP_IPV6 => {
            let mut octets = [0u8; 16];
            stream.read_exact(&mut octets).await?;
            let mut port = [0u8; 2];
            stream.read_exact(&mut port).await?;
            (
                std::net::Ipv6Addr::from(octets).to_string(),
                u16::from_be_bytes(port),
            )
        }
        ATYP_DOMAIN => {
            let len = stream.read_u8().await? as usize;
            let mut bytes = vec![0u8; len];
            stream.read_exact(&mut bytes).await?;
            let mut port = [0u8; 2];
            stream.read_exact(&mut port).await?;
            (
                String::from_utf8(bytes).map_err(|_| anyhow!("invalid domain utf-8"))?,
                u16::from_be_bytes(port),
            )
        }
        other => {
            reply(&mut stream, 0x08).await?;
            return Err(anyhow!("unsupported atyp {other}"));
        }
    };

    // === Open direct-tcpip and reply ===
    let channel = match session
        .channel_open_direct_tcpip(host.clone(), port as u32, "127.0.0.1".to_string(), 0)
        .await
    {
        Ok(c) => c,
        Err(e) => {
            // 0x05 = Connection refused; better generic mapping is overkill for now.
            reply(&mut stream, 0x05).await?;
            return Err(anyhow!("open direct-tcpip {host}:{port}: {e}"));
        }
    };
    reply(&mut stream, 0x00).await?;

    // === Bidirectional copy ===
    let mut chan_stream = channel.into_stream();
    let (mut client_r, mut client_w) = stream.split();
    let (mut chan_r, mut chan_w) = tokio::io::split(&mut chan_stream);

    let client_to_server = async {
        let r = tokio::io::copy(&mut client_r, &mut chan_w).await;
        let _ = chan_w.shutdown().await;
        r
    };
    let server_to_client = async {
        let r = tokio::io::copy(&mut chan_r, &mut client_w).await;
        let _ = client_w.shutdown().await;
        r
    };

    tokio::select! {
        _ = shutdown_rx.changed() => Ok(()),
        res = client_to_server => res.map(|_| ()).map_err(|e| anyhow!("client->server: {e}")),
        res = server_to_client => res.map(|_| ()).map_err(|e| anyhow!("server->client: {e}")),
    }
}

/// Send a SOCKS5 reply with the given status code. The bound address is
/// reported as `0.0.0.0:0` which all real clients accept for CONNECT.
async fn reply(stream: &mut TcpStream, status: u8) -> Result<()> {
    let buf = [
        0x05, status, 0x00, ATYP_IPV4, // bound addr type
        0, 0, 0, 0, // bound addr (unused)
        0, 0, // bound port (unused)
    ];
    stream.write_all(&buf).await?;
    Ok(())
}
