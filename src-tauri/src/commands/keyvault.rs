//! Tauri commands for the OS keychain. Account ids in scope today are host UUIDs.

use crate::keyvault;
use crate::AppError;

#[tauri::command]
pub fn save_host_password(host_id: String, password: String) -> Result<(), AppError> {
    Ok(keyvault::set_secret(&host_id, &password)?)
}

#[tauri::command]
pub fn get_host_password(host_id: String) -> Result<Option<String>, AppError> {
    Ok(keyvault::get_secret(&host_id)?)
}

#[tauri::command]
pub fn delete_host_password(host_id: String) -> Result<bool, AppError> {
    Ok(keyvault::delete_secret(&host_id)?)
}

#[tauri::command]
pub fn has_host_password(host_id: String) -> Result<bool, AppError> {
    Ok(keyvault::get_secret(&host_id)?.is_some())
}
