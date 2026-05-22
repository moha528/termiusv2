//! Termius v2 — backend Rust (entrée bibliothèque Tauri).
//!
//! Le binaire `main.rs` appelle simplement [`run`] qui assemble le pool DB,
//! enregistre les commandes IPC et lance la boucle Tauri.

pub mod commands;
pub mod error;
pub mod keyvault;
pub mod models;
pub mod ssh;
pub mod store;
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
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("resolve app data dir");
            let db_path = store::default_db_path(&app_data_dir);

            // sqlx is async — run a blocking task to init the pool before Tauri starts.
            let pool = tauri::async_runtime::block_on(async {
                store::init_pool(&db_path).await.expect("init sqlite pool")
            });
            app.manage(pool);
            app.manage(ssh::SessionManager::default());

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
            commands::sessions::open_ssh_session,
            commands::sessions::send_terminal_input,
            commands::sessions::resize_terminal,
            commands::sessions::close_session,
            commands::settings::get_all_settings,
            commands::settings::set_setting,
            commands::keyvault::save_host_password,
            commands::keyvault::get_host_password,
            commands::keyvault::delete_host_password,
            commands::keyvault::has_host_password,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
