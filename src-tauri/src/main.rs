// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    set_dock_name();
    dev_doctor_lib::run()
}

#[cfg(target_os = "macos")]
fn set_dock_name() {
    use objc2_foundation::{NSProcessInfo, NSString};
    let name = NSString::from_str("Dev Doctor");
    NSProcessInfo::processInfo().setProcessName(&name);
}

#[cfg(not(target_os = "macos"))]
fn set_dock_name() {}
