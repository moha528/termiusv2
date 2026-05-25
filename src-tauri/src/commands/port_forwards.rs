//! `port_forwards_*` Tauri commands. Handles the persistent rows (CRUD)
//! plus the start/stop dance that spawns or tears down the runtime workers
//! in `ForwardRegistry`.

use tauri::State;

use crate::keyvault;
use crate::models::{Host, PortForward, PortForwardInput};
use crate::port_forward::{self, ForwardRegistry};
use crate::ssh::{ConnectParams, KeyAuth, Session};
use crate::ssh_keys;
use crate::store::{hosts as hosts_dao, port_forwards as dao, ssh_keys as keys_dao, DbPool};
use crate::AppError;

#[tauri::command]
pub async fn list_port_forwards(
    pool: State<'_, DbPool>,
    host_id: String,
) -> Result<Vec<PortForward>, AppError> {
    Ok(dao::list_for_host(pool.inner(), &host_id).await?)
}

#[tauri::command]
pub async fn create_port_forward(
    pool: State<'_, DbPool>,
    input: PortForwardInput,
) -> Result<PortForward, AppError> {
    Ok(dao::create(pool.inner(), input).await?)
}

#[tauri::command]
pub async fn update_port_forward(
    pool: State<'_, DbPool>,
    id: String,
    input: PortForwardInput,
) -> Result<PortForward, AppError> {
    Ok(dao::update(pool.inner(), &id, input).await?)
}

#[tauri::command]
pub async fn delete_port_forward(
    pool: State<'_, DbPool>,
    registry: State<'_, ForwardRegistry>,
    id: String,
) -> Result<bool, AppError> {
    // Stop the runtime worker first so we don't leak a listening socket.
    if let Some(running) = registry.remove(&id).await {
        let _ = running.stop().await;
    }
    Ok(dao::delete(pool.inner(), &id).await?)
}

/// Start a forward — opens a dedicated SSH session for it and binds the
/// local listening socket. The forward must already exist in DB.
#[tauri::command]
pub async fn start_port_forward(
    pool: State<'_, DbPool>,
    registry: State<'_, ForwardRegistry>,
    id: String,
) -> Result<(), AppError> {
    if registry.is_active(&id).await {
        return Err(AppError(anyhow::anyhow!("forward {id} is already running")));
    }
    let fwd = dao::get(pool.inner(), &id).await?;
    let host: Host = hosts_dao::get(pool.inner(), &fwd.host_id).await?;
    let session = connect_for_forward(pool.inner(), &host).await?;
    let local_port: u16 = u16::try_from(fwd.local_port)
        .map_err(|_| AppError(anyhow::anyhow!("invalid local_port {}", fwd.local_port)))?;

    let running = match fwd.forward_type.as_str() {
        "local" => {
            let remote_port: u16 = u16::try_from(fwd.remote_port).map_err(|_| {
                AppError(anyhow::anyhow!("invalid remote_port {}", fwd.remote_port))
            })?;
            port_forward::start_local(session, local_port, fwd.remote_host, remote_port)
                .await
                .map_err(AppError)?
        }
        "dynamic" => port_forward::start_dynamic(session, local_port)
            .await
            .map_err(AppError)?,
        "remote" => {
            // For -R the schema fields take their reverse meaning:
            //   local_port  → the port the server should listen on
            //   remote_host → the local host we forward to
            //   remote_port → the local port we forward to
            let target_port: u16 = u16::try_from(fwd.remote_port).map_err(|_| {
                AppError(anyhow::anyhow!("invalid remote_port {}", fwd.remote_port))
            })?;
            port_forward::start_remote(session, local_port, fwd.remote_host, target_port)
                .await
                .map_err(AppError)?
        }
        other => {
            return Err(AppError(anyhow::anyhow!(
                "forward type {other} not implemented yet"
            )));
        }
    };
    registry.insert(id, running).await;
    Ok(())
}

#[tauri::command]
pub async fn stop_port_forward(
    registry: State<'_, ForwardRegistry>,
    id: String,
) -> Result<(), AppError> {
    if let Some(running) = registry.remove(&id).await {
        running.stop().await.map_err(AppError)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn list_active_port_forwards(
    registry: State<'_, ForwardRegistry>,
) -> Result<Vec<String>, AppError> {
    Ok(registry.active_ids().await)
}

/// Stop every running forward at once. Used by the vault lock flow so an
/// active `-L`/`-R`/`-D` doesn't survive past a security boundary.
#[tauri::command]
pub async fn stop_all_port_forwards(
    registry: State<'_, ForwardRegistry>,
) -> Result<usize, AppError> {
    Ok(registry.stop_all().await)
}

/// Open a fresh SSH session for `host`, reusing the same auth chain
/// (keys + keychain password) as the terminal flow. We do NOT prompt the
/// user — a forward should work entirely from saved credentials.
async fn connect_for_forward(pool: &DbPool, host: &Host) -> Result<Session, AppError> {
    let port: u16 = host
        .port
        .try_into()
        .map_err(|_| AppError(anyhow::anyhow!("invalid port {}", host.port)))?;
    let key_rows = keys_dao::list_for_host(pool, &host.id).await?;
    let keys: Vec<KeyAuth> = key_rows
        .into_iter()
        .map(|k| {
            let passphrase = if k.has_passphrase {
                keyvault::get_secret(&ssh_keys::passphrase_account(&k.id))
                    .ok()
                    .flatten()
            } else {
                None
            };
            KeyAuth {
                private_key_path: k.private_key_path,
                passphrase,
            }
        })
        .collect();
    let password = keyvault::get_secret(&host.id)
        .ok()
        .flatten()
        .unwrap_or_default();
    Session::connect(
        pool,
        ConnectParams {
            hostname: &host.hostname,
            port,
            username: &host.username,
            password: &password,
            keys,
            // Forwards don't need agent forwarding — they only carry TCP
            // tunnels, no interactive shell. Hard-coded false to avoid
            // accepting auth-agent channels on a tunnel-only session.
            agent_forward: false,
        },
    )
    .await
    .map_err(|e| AppError(anyhow::anyhow!(e.to_string())))
}
