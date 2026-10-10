mod artifacts;
mod chrome;
mod history;
mod probe;
mod processes;
mod security;
mod snapshot;

use history::{data_dir, load, load_cleanups, save, save_cleanups};
use probe::{execute_install, inspect_listen_port, FixExecutionResult, PortInspection};
use security::ensure_allowed_url;
use serde::Serialize;
use tauri::Emitter;
use snapshot::{collect_project_snapshot, ProjectSnapshot};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppMetadata {
    version: String,
    data_directory: String,
}

#[tauri::command]
async fn collect_snapshot(project_path: String) -> Result<ProjectSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || collect_project_snapshot(&project_path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
fn inspect_port(port: u16) -> Result<PortInspection, String> {
    inspect_listen_port(port)
}

#[tauri::command]
fn execute_fix(action: String, project_path: String) -> Result<FixExecutionResult, String> {
    execute_install(&action, &project_path)
}

#[tauri::command]
fn open_allowed_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    ensure_allowed_url(&url)?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_history(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    load(&app)
}

#[tauri::command]
fn save_history(app: tauri::AppHandle, entries: Vec<serde_json::Value>) -> Result<(), String> {
    save(&app, entries)
}

#[tauri::command]
fn load_cleanup_history(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    load_cleanups(&app)
}

#[tauri::command]
fn save_cleanup_history(app: tauri::AppHandle, entries: Vec<serde_json::Value>) -> Result<(), String> {
    save_cleanups(&app, entries)
}

#[tauri::command]
async fn delete_artifacts(project_path: String, relative_paths: Vec<String>) -> Result<artifacts::DeleteReport, String> {
    tauri::async_runtime::spawn_blocking(move || artifacts::delete_scanned_directories(&project_path, &relative_paths))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn list_processes(include_all: bool) -> Result<Vec<processes::ProcessInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || processes::list_processes(include_all))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn terminate_process(pid: u32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || processes::terminate_process(pid))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
fn app_metadata(app: tauri::AppHandle) -> Result<AppMetadata, String> {
    Ok(AppMetadata {
        version: env!("CARGO_PKG_VERSION").to_string(),
        data_directory: data_dir(&app)?.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn window_chrome(window: tauri::WebviewWindow) -> Result<chrome::WindowChrome, String> {
    chrome::measure(window)
}

#[tauri::command]
async fn scan_artifacts(app: tauri::AppHandle, project_path: String) -> Result<artifacts::ArtifactScan, String> {
    tauri::async_runtime::spawn_blocking(move || {
        artifacts::scan_project_artifacts(&project_path, &mut |progress| {
            let _ = app.emit("artifact-scan-progress", &progress);
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(
            tauri_plugin_mcp_bridge::Builder::new()
                .bind_address("127.0.0.1")
                .build(),
        );
    }

    builder
        .invoke_handler(tauri::generate_handler![
            collect_snapshot,
            inspect_port,
            execute_fix,
            open_allowed_url,
            load_history,
            save_history,
            load_cleanup_history,
            save_cleanup_history,
            delete_artifacts,
            list_processes,
            terminate_process,
            app_metadata,
            window_chrome,
            scan_artifacts
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
