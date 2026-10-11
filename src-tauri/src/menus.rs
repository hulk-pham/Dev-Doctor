use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Runtime};

const TRAY_ICON: &[u8] = include_bytes!("../icons/trayTemplate.png");

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
    let check_updates = MenuItem::with_id(app, "check-updates", "Check for Updates…", true, None::<&str>)?;
    let workspace = MenuItem::with_id(app, "nav-workspace", "Workspace", true, Some("CmdOrCtrl+1"))?;
    let projects = MenuItem::with_id(app, "nav-projects", "Projects", true, Some("CmdOrCtrl+2"))?;
    let processes = MenuItem::with_id(app, "nav-processes", "Processes", true, Some("CmdOrCtrl+3"))?;
    let scan = MenuItem::with_id(app, "scan-project", "Scan Project", true, Some("CmdOrCtrl+Shift+R"))?;
    let refresh = MenuItem::with_id(app, "refresh-processes", "Refresh Process List", true, None::<&str>)?;

    let app_menu = Submenu::with_items(
        app,
        "Dev Doctor",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("About Dev Doctor"), None)?,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &check_updates,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let tools_menu = Submenu::with_items(
        app,
        "Tools",
        true,
        &[
            &workspace,
            &projects,
            &processes,
            &PredefinedMenuItem::separator(app)?,
            &scan,
            &refresh,
        ],
    )?;

    Menu::with_items(app, &[&app_menu, &edit_menu, &tools_menu])
}

pub fn install_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::tray::TrayIcon<R>> {
    let menu = tray_menu(app)?;
    let icon = tauri::image::Image::from_bytes(TRAY_ICON)?;
    TrayIconBuilder::with_id("dev-doctor")
        .tooltip("Dev Doctor")
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .build(app)
}

fn tray_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let show = MenuItem::with_id(app, "show-window", "Show Dev Doctor", true, None::<&str>)?;
    let workspace = MenuItem::with_id(app, "nav-workspace", "Workspace", true, None::<&str>)?;
    let projects = MenuItem::with_id(app, "nav-projects", "Projects", true, None::<&str>)?;
    let processes = MenuItem::with_id(app, "nav-processes", "Processes", true, None::<&str>)?;
    let scan = MenuItem::with_id(app, "scan-project", "Scan Project", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh-processes", "Refresh Process List", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let check_updates = MenuItem::with_id(app, "check-updates", "Check for Updates…", true, None::<&str>)?;
    Menu::with_items(
        app,
        &[
            &show,
            &PredefinedMenuItem::separator(app)?,
            &workspace,
            &projects,
            &processes,
            &PredefinedMenuItem::separator(app)?,
            &scan,
            &refresh,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &check_updates,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some("Quit Dev Doctor"))?,
        ],
    )
}

pub fn dispatch<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if matches!(
        id,
        "show-window" | "nav-workspace" | "nav-projects" | "nav-processes" | "settings" | "scan-project" | "refresh-processes" | "check-updates"
    ) {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
    if id != "show-window" {
        let _ = app.emit("menu-action", id.to_string());
    }
}
