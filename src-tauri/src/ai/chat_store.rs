use crate::history::data_dir;
use std::fs;
use tauri::AppHandle;

const DIR_NAME: &str = "ai-chat";

fn scope_path(app: &AppHandle, scope: &str) -> Result<std::path::PathBuf, String> {
    let safe: String = scope
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '_' })
        .collect();
    if safe.is_empty() {
        return Err("Chat scope is empty.".into());
    }
    Ok(data_dir(app)?.join(DIR_NAME).join(format!("{safe}.json")))
}

pub fn load_chat_store_json(app: &AppHandle, scope: &str) -> Result<Option<String>, String> {
    let path = scope_path(app, scope)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|error| format!("Could not read chat history: {error}"))
}

pub fn save_chat_store_json(app: &AppHandle, scope: &str, json: &str) -> Result<(), String> {
    let path = scope_path(app, scope)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("Could not create chat folder: {error}"))?;
    }
    fs::write(&path, json).map_err(|error| format!("Could not save chat history: {error}"))
}
