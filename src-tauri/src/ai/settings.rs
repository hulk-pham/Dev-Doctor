use crate::history::data_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::AppHandle;

const FILE_NAME: &str = "ai-settings.json";
pub const DEFAULT_PROVIDER: &str = "openai";
pub const DEFAULT_MODEL: &str = "gpt-4o-mini";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    #[serde(default = "default_provider")]
    pub provider: String,
    #[serde(default = "default_model")]
    pub model: String,
}

fn default_provider() -> String {
    DEFAULT_PROVIDER.into()
}

fn default_model() -> String {
    DEFAULT_MODEL.into()
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            provider: DEFAULT_PROVIDER.into(),
            model: DEFAULT_MODEL.into(),
        }
    }
}

impl AiSettings {
    pub fn normalized(mut self) -> Self {
        if self.provider.trim().is_empty() {
            self.provider = DEFAULT_PROVIDER.into();
        }
        if self.model.trim().is_empty() {
            self.model = DEFAULT_MODEL.into();
        }
        self
    }
}

pub fn load_ai_settings(app: &AppHandle) -> Result<AiSettings, String> {
    let path = data_dir(app)?.join(FILE_NAME);
    if !path.exists() {
        return Ok(AiSettings::default());
    }
    let raw = fs::read_to_string(&path).map_err(|error| format!("Could not read AI settings: {error}"))?;
    let parsed: AiSettings =
        serde_json::from_str(&raw).map_err(|error| format!("AI settings file is invalid: {error}"))?;
    Ok(parsed.normalized())
}

pub fn save_ai_settings(app: &AppHandle, settings: AiSettings) -> Result<AiSettings, String> {
    let settings = settings.normalized();
    let path = data_dir(app)?.join(FILE_NAME);
    let json = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    fs::write(&path, json).map_err(|error| format!("Could not save AI settings: {error}"))?;
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_json_never_includes_api_key_field() {
        let settings = AiSettings::default();
        let json = serde_json::to_string(&settings).expect("serialize");
        assert!(!json.to_lowercase().contains("apikey"));
        assert!(!json.contains("sk-"));
    }
}
