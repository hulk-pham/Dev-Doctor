use crate::monitoring::alert_manager::MonitorAlert;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

pub fn show_alert(app: &AppHandle, alert: &MonitorAlert) {
    let _ = app
        .notification()
        .builder()
        .title(&alert.title)
        .body(&alert.summary)
        .show();
}
