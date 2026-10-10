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

pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve the local data folder: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("Could not create the local data folder: {error}"))?;
    Ok(dir)
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
