mod ai;
mod artifacts;
mod chrome;
mod history;
mod layout;
mod menus;
mod monitoring;
mod probe;
mod processes;
mod security;
mod snapshot;
mod updater;

use history::{data_dir, load, load_cleanups, save, save_cleanups};
use probe::{execute_install, inspect_listen_port, FixExecutionResult, PortInspection};
use security::ensure_allowed_url;
use serde::Serialize;
use ai::{
    chat_async, delete_api_key, diagnose_async, is_configured_for_settings, load_ai_settings, save_ai_settings,
    store_api_key, test_connection, AiChatTurn, AiDiagnosisResponse, AiError, AiErrorCode, AiInflight, AiSettings,
    ApiKeyProvider,
};
use tokio::sync::oneshot;
use monitoring::{
    load_settings, save_settings, AlertHistoryQuery, MonitorAlert, MonitorHandle, MonitorSample, MonitorSettings,
    MonitorStatus, MonitorStorage, MonitorStorageStatus,
};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};
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
fn classify_folder(project_path: String) -> Result<layout::FolderLayout, String> {
    layout::classify_folder(&project_path)
}

#[tauri::command]
async fn check_for_update() -> Result<updater::UpdateCheck, String> {
    tauri::async_runtime::spawn_blocking(updater::check_for_update)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn monitor_settings_load(app: tauri::AppHandle) -> Result<MonitorSettings, String> {
    load_settings(&app)
}

#[tauri::command]
fn monitor_settings_save(
    app: tauri::AppHandle,
    monitor: State<'_, MonitorHandle>,
    settings: MonitorSettings,
) -> Result<MonitorSettings, String> {
    let saved = save_settings(&app, settings)?;
    monitor.apply_settings(&app, saved.clone())?;
    Ok(saved)
}

#[tauri::command]
fn monitor_start(app: tauri::AppHandle, monitor: State<'_, MonitorHandle>) -> Result<MonitorStatus, String> {
    let mut settings = load_settings(&app)?;
    settings.enabled = true;
    let saved = save_settings(&app, settings)?;
    monitor.apply_settings(&app, saved)?;
    monitor.status()
}

#[tauri::command]
fn monitor_stop(app: tauri::AppHandle, monitor: State<'_, MonitorHandle>) -> Result<MonitorStatus, String> {
    let mut settings = load_settings(&app)?;
    settings.enabled = false;
    let saved = save_settings(&app, settings)?;
    monitor.apply_settings(&app, saved)?;
    monitor.status()
}

#[tauri::command]
fn monitor_status(monitor: State<'_, MonitorHandle>) -> Result<MonitorStatus, String> {
    monitor.status()
}

#[tauri::command]
fn monitor_recent(monitor: State<'_, MonitorHandle>, range: String) -> Result<Vec<MonitorSample>, String> {
    monitor.recent(&range)
}

#[tauri::command]
fn monitor_alerts_list(monitor: State<'_, MonitorHandle>) -> Result<Vec<MonitorAlert>, String> {
    monitor.alerts()
}

#[tauri::command]
fn monitor_alert_dismiss(monitor: State<'_, MonitorHandle>, alert_id: String) -> Result<Vec<MonitorAlert>, String> {
    monitor.dismiss_alert(&alert_id)
}

#[tauri::command]
fn monitor_alert_mute_rule(monitor: State<'_, MonitorHandle>, rule_id: String) -> Result<Vec<MonitorAlert>, String> {
    monitor.mute_rule(&rule_id)
}

#[tauri::command]
fn monitor_alerts_query(monitor: State<'_, MonitorHandle>, query: AlertHistoryQuery) -> Result<Vec<MonitorAlert>, String> {
    monitor.alerts_query(query)
}

#[tauri::command]
fn monitor_storage_status(storage: State<'_, Arc<Mutex<MonitorStorage>>>) -> Result<MonitorStorageStatus, String> {
    Ok(storage.lock().map_err(|_| "Monitor storage lock failed.".to_string())?.status())
}

#[tauri::command]
fn monitor_clear_history(monitor: State<'_, MonitorHandle>) -> Result<(), String> {
    monitor.clear_history()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiKeyStatus {
    configured: bool,
    provider: String,
}

#[tauri::command]
fn ai_settings_load(app: tauri::AppHandle) -> Result<AiSettings, String> {
    load_ai_settings(&app)
}

#[tauri::command]
fn ai_settings_save(app: tauri::AppHandle, settings: AiSettings) -> Result<AiSettings, String> {
    save_ai_settings(&app, settings)
}

#[tauri::command]
fn ai_key_status(app: tauri::AppHandle) -> Result<AiKeyStatus, String> {
    let settings = load_ai_settings(&app)?;
    Ok(AiKeyStatus {
        configured: is_configured_for_settings(&settings)?,
        provider: settings.provider,
    })
}

#[tauri::command]
fn ai_key_save(app: tauri::AppHandle, api_key: String) -> Result<AiKeyStatus, String> {
    let settings = load_ai_settings(&app)?;
    if ai::is_dev_mock_provider(&settings.provider) {
        return ai_key_status(app);
    }
    let provider = ApiKeyProvider::from_settings_id(&settings.provider)?;
    store_api_key(provider, &api_key)?;
    ai_key_status(app)
}

#[tauri::command]
fn ai_key_delete(app: tauri::AppHandle) -> Result<AiKeyStatus, String> {
    let settings = load_ai_settings(&app)?;
    if ai::is_dev_mock_provider(&settings.provider) {
        return ai_key_status(app);
    }
    let provider = ApiKeyProvider::from_settings_id(&settings.provider)?;
    delete_api_key(provider)?;
    ai_key_status(app)
}

fn ai_settings_err(message: String) -> AiError {
    AiError {
        code: AiErrorCode::ProviderMessage,
        message,
    }
}

fn ai_join_err(error: tauri::Error) -> AiError {
    AiError {
        code: AiErrorCode::ProviderMessage,
        message: error.to_string(),
    }
}

async fn run_cancellable_ai<T, Fut>(app: &tauri::AppHandle, work: Fut) -> Result<T, AiError>
where
    T: Send + 'static,
    Fut: std::future::Future<Output = Result<T, AiError>> + Send + 'static,
{
    let inflight = app.state::<AiInflight>();
    inflight.cancel();
    let (tx, rx) = oneshot::channel();
    let handle = tauri::async_runtime::spawn(async move {
        let _ = tx.send(work.await);
    });
    inflight.track(handle);
    match rx.await {
        Ok(result) => {
            inflight.clear();
            result
        }
        Err(_) => Err(AiError {
            code: AiErrorCode::Cancelled,
            message: "Request cancelled.".into(),
        }),
    }
}

#[tauri::command]
fn ai_cancel_inflight(app: tauri::AppHandle) {
    app.state::<AiInflight>().cancel();
}

#[tauri::command]
async fn ai_test_connection(app: tauri::AppHandle) -> Result<(), AiError> {
    tauri::async_runtime::spawn_blocking(move || {
        let settings = load_ai_settings(&app).map_err(ai_settings_err)?;
        test_connection(&settings)
    })
    .await
    .map_err(ai_join_err)?
}

#[tauri::command]
async fn ai_diagnose(app: tauri::AppHandle, context_text: String) -> Result<AiDiagnosisResponse, AiError> {
    let app2 = app.clone();
    run_cancellable_ai(&app, async move {
        let settings = load_ai_settings(&app2).map_err(ai_settings_err)?;
        diagnose_async(&settings, &context_text).await
    })
    .await
}

#[tauri::command]
async fn ai_chat(app: tauri::AppHandle, messages: Vec<AiChatTurn>) -> Result<String, AiError> {
    let app2 = app.clone();
    run_cancellable_ai(&app, async move {
        let settings = load_ai_settings(&app2).map_err(ai_settings_err)?;
        chat_async(&settings, &messages).await
    })
    .await
}

#[tauri::command]
fn ai_chat_store_load(app: tauri::AppHandle, scope: String) -> Result<Option<String>, String> {
    ai::load_chat_store_json(&app, &scope)
}

#[tauri::command]
fn ai_chat_store_save(app: tauri::AppHandle, scope: String, json: String) -> Result<(), String> {
    ai::save_chat_store_json(&app, &scope, &json)
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init());

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(
            tauri_plugin_mcp_bridge::Builder::new()
                .bind_address("127.0.0.1")
                .build(),
        );
    }

    builder
        .menu(|app| menus::build(app))
        .on_menu_event(|app, event| menus::dispatch(app, &event.id().0))
        .setup(|app| {
            let tray = menus::install_tray(app.handle())?;
            app.manage(tray);
            let storage = MonitorStorage::open(app.handle());
            let monitor = MonitorHandle::new(Arc::clone(&storage));
            if let Ok(settings) = load_settings(app.handle()) {
                let _ = monitor.hydrate(&settings);
                if settings.enabled {
                    let _ = monitor.apply_settings(app.handle(), settings);
                }
            }
            app.manage(storage);
            app.manage(monitor);
            app.manage(AiInflight::new());
            Ok(())
        })
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
            scan_artifacts,
            classify_folder,
            check_for_update,
            monitor_settings_load,
            monitor_settings_save,
            monitor_start,
            monitor_stop,
            monitor_status,
            monitor_recent,
            monitor_alerts_list,
            monitor_alert_dismiss,
            monitor_alert_mute_rule,
            monitor_alerts_query,
            monitor_storage_status,
            monitor_clear_history,
            ai_settings_load,
            ai_settings_save,
            ai_key_status,
            ai_key_save,
            ai_key_delete,
            ai_test_connection,
            ai_diagnose,
            ai_chat,
            ai_cancel_inflight,
            ai_chat_store_load,
            ai_chat_store_save
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
