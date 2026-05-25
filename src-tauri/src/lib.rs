//! Lynk Client — backend Rust (entrée bibliothèque Tauri).
//!
//! Le binaire `main.rs` appelle simplement [`run`] qui assemble le pool DB,
//! enregistre les commandes IPC et lance la boucle Tauri.

pub mod command_capture;
pub mod commands;
pub mod edit;
pub mod error;
pub mod import;
pub mod keyvault;
pub mod local_pty;
pub mod models;
pub mod port_forward;
pub mod sftp;
pub mod snippets;
pub mod ssh;
pub mod ssh_keys;
pub mod store;
pub mod sync_git;
pub mod vault;
pub mod vault_export;
#[cfg(target_os = "windows")]
mod window_chrome;

pub use error::AppError;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,sqlx=warn".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("resolve app data dir");
            let db_path = store::default_db_path(&app_data_dir);

            // sqlx is async — run a blocking task to init the pool before Tauri starts.
            let pool = tauri::async_runtime::block_on(async {
                store::init_pool(&db_path).await.expect("init sqlite pool")
            });
            app.manage(pool);
            app.manage(ssh::SessionManager::default());
            app.manage(local_pty::LocalSessionManager::default());
            app.manage(sftp::TransferRegistry::default());
            app.manage(edit::EditRegistry::default());
            app.manage(port_forward::ForwardRegistry::default());
            app.manage(command_capture::CommandCapture::default());

            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                window_chrome::style_titlebar(&window);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::hosts::list_hosts,
            commands::hosts::create_host,
            commands::hosts::update_host,
            commands::hosts::delete_host,
            commands::groups::list_groups,
            commands::groups::create_group,
            commands::groups::update_group,
            commands::groups::delete_group,
            commands::groups::move_host_to_group,
            commands::tags::list_tags,
            commands::tags::create_tag,
            commands::tags::update_tag,
            commands::tags::delete_tag,
            commands::tags::set_host_tags,
            commands::tags::list_host_tag_links,
            commands::ssh_keys::list_ssh_keys,
            commands::ssh_keys::generate_ssh_key,
            commands::ssh_keys::import_ssh_key,
            commands::ssh_keys::delete_ssh_key,
            commands::ssh_keys::list_host_key_links,
            commands::ssh_keys::set_host_keys,
            commands::known_hosts::list_known_hosts,
            commands::known_hosts::forget_known_host,
            commands::port_forwards::list_port_forwards,
            commands::port_forwards::create_port_forward,
            commands::port_forwards::update_port_forward,
            commands::port_forwards::delete_port_forward,
            commands::port_forwards::start_port_forward,
            commands::port_forwards::stop_port_forward,
            commands::port_forwards::list_active_port_forwards,
            commands::port_forwards::stop_all_port_forwards,
            commands::vault::vault_has_pin,
            commands::vault::vault_verify_pin,
            commands::vault::vault_set_pin,
            commands::vault::vault_change_pin,
            commands::vault::vault_disable_pin,
            commands::sessions::open_ssh_session,
            commands::sessions::send_terminal_input,
            commands::sessions::resize_terminal,
            commands::sessions::close_session,
            commands::local_pty::open_local_session,
            commands::local_pty::local_send_input,
            commands::local_pty::local_resize,
            commands::local_pty::local_close,
            commands::settings::get_all_settings,
            commands::settings::set_setting,
            commands::keyvault::save_host_password,
            commands::keyvault::get_host_password,
            commands::keyvault::delete_host_password,
            commands::keyvault::has_host_password,
            commands::import::read_ssh_config,
            commands::import::read_ssh_config_at,
            commands::import::import_ssh_config,
            commands::sftp::sftp_list_dir,
            commands::sftp::sftp_stat,
            commands::sftp::sftp_mkdir,
            commands::sftp::sftp_create_file,
            commands::sftp::sftp_remove,
            commands::sftp::sftp_rename,
            commands::sftp::sftp_upload,
            commands::sftp::sftp_download,
            commands::sftp::sftp_cancel_transfer,
            commands::fs_local::local_home_dir,
            commands::fs_local::local_list_dir,
            commands::fs_local::local_mkdir,
            commands::fs_local::local_create_file,
            commands::fs_local::local_remove,
            commands::fs_local::local_rename,
            commands::edit::open_remote_edit,
            commands::edit::cancel_remote_edit,
            commands::snippets::list_snippets,
            commands::snippets::create_snippet,
            commands::snippets::update_snippet,
            commands::snippets::delete_snippet,
            commands::snippets::extract_snippet_variables,
            commands::snippets::render_snippet,
            commands::command_history::list_command_history,
            commands::command_history::clear_command_history,
            commands::identities::list_identities,
            commands::identities::create_identity,
            commands::identities::update_identity,
            commands::identities::delete_identity,
            commands::identities::set_identity_keys,
            commands::identities::list_identity_key_links,
            commands::vault_export::export_vault,
            commands::vault_export::import_vault,
            commands::sync_git::sync_get_state,
            commands::sync_git::sync_test_connection,
            commands::sync_git::sync_configure,
            commands::sync_git::sync_disable,
            commands::sync_git::sync_forget_pat,
            commands::sync_git::sync_set_password,
            commands::sync_git::sync_has_password,
            commands::sync_git::sync_push_now,
            commands::sync_git::sync_pull_now,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
