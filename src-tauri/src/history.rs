use crate::security::sanitize_json;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
struct HistoryFile {
    entries: Vec<Value>,
}

const DEV_DATA_ENV: &str = "DEV_DOCTOR_DATA_DIR";
const APP_DATA_NAME: &str = "com.devdoctor.app";

/// Chooses the local data folder. Release builds always use `base`.
/// Debug builds (`tauri dev`) never share the installed app's folder: they use
/// `DEV_DOCTOR_DATA_DIR` when it is an absolute path, otherwise a sibling `com.devdoctor.app.dev`.
pub fn resolve_data_dir(base: PathBuf, override_dir: Option<String>, debug: bool) -> PathBuf {
    if !debug {
        return base;
    }
    if let Some(path) = override_dir.map(|value| PathBuf::from(value.trim())) {
        if path.is_absolute() {
            return path;
        }
    }
    match base.parent() {
        Some(parent) => parent.join(format!("{APP_DATA_NAME}.dev")),
        None => base,
    }
}

pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve the local data folder: {error}"))?;
    let dir = resolve_data_dir(base, std::env::var(DEV_DATA_ENV).ok(), cfg!(debug_assertions));
    fs::create_dir_all(&dir).map_err(|error| format!("Could not create the local data folder: {error}"))?;
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::resolve_data_dir;
    use std::path::PathBuf;

    fn installed() -> PathBuf {
        PathBuf::from("/Users/example/Library/Application Support/com.devdoctor.app")
    }

    #[test]
    fn release_always_uses_the_installed_folder() {
        assert_eq!(resolve_data_dir(installed(), Some("/tmp/other".into()), false), installed());
        assert_eq!(resolve_data_dir(installed(), None, false), installed());
    }

    #[test]
    fn debug_uses_an_absolute_override() {
        assert_eq!(
            resolve_data_dir(installed(), Some("/tmp/dd-test".into()), true),
            PathBuf::from("/tmp/dd-test")
        );
    }

    #[test]
    fn debug_ignores_a_relative_or_empty_override() {
        let dev = PathBuf::from("/Users/example/Library/Application Support/com.devdoctor.app.dev");
        assert_eq!(resolve_data_dir(installed(), Some("relative/path".into()), true), dev);
        assert_eq!(resolve_data_dir(installed(), Some("   ".into()), true), dev);
        assert_eq!(resolve_data_dir(installed(), None, true), dev);
    }
}

pub fn load(app: &AppHandle) -> Result<Vec<Value>, String> {
    let path = data_dir(app)?.join("scan-history.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(_) => return Ok(Vec::new()),
    };
    match serde_json::from_str::<HistoryFile>(&text) {
        Ok(mut file) => {
            for entry in &mut file.entries {
                sanitize_json(entry);
            }
            Ok(file.entries)
        }
        Err(_) => {
            let _ = fs::rename(&path, path.with_extension("corrupt.json"));
            Ok(Vec::new())
        }
    }
}

pub fn load_cleanups(app: &AppHandle) -> Result<Vec<Value>, String> {
    read_entries(app, "cleanup-history.json")
}

pub fn save_cleanups(app: &AppHandle, entries: Vec<Value>) -> Result<(), String> {
    write_entries(app, "cleanup-history.json", entries)
}

fn read_entries(app: &AppHandle, file_name: &str) -> Result<Vec<Value>, String> {
    let path = data_dir(app)?.join(file_name);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(_) => return Ok(Vec::new()),
    };
    match serde_json::from_str::<HistoryFile>(&text) {
        Ok(mut file) => {
            for entry in &mut file.entries {
                sanitize_json(entry);
            }
            Ok(file.entries)
        }
        Err(_) => {
            let _ = fs::rename(&path, path.with_extension("corrupt.json"));
            Ok(Vec::new())
        }
    }
}

pub fn save(app: &AppHandle, entries: Vec<Value>) -> Result<(), String> {
    write_entries(app, "scan-history.json", entries)
}

fn write_entries(app: &AppHandle, file_name: &str, mut entries: Vec<Value>) -> Result<(), String> {
    if entries.len() > 40 {
        entries.truncate(40);
    }
    for entry in &mut entries {
        sanitize_json(entry);
    }
    let payload = serde_json::to_vec_pretty(&HistoryFile { entries }).map_err(|error| error.to_string())?;
    if payload.len() > 1_500_000 {
        return Err("The scan history is too large to store.".into());
    }
    let path = data_dir(app)?.join(file_name);
    fs::write(path, payload).map_err(|error| format!("Could not save local history: {error}"))
}
