use crate::history::data_dir;
use crate::monitoring::rules::RuleConfig;
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::AppHandle;

const FILE_NAME: &str = "monitor-settings.json";
const MIN_INTERVAL: u64 = 2;
const MAX_INTERVAL: u64 = 60;
const DEFAULT_INTERVAL: u64 = 5;
const MIN_RETENTION_DAYS: u32 = 7;
const MAX_RETENTION_DAYS: u32 = 90;
const DEFAULT_RETENTION_DAYS: u32 = 30;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_interval")]
    pub interval_seconds: u64,
    #[serde(default)]
    pub rules: Vec<RuleConfig>,
    #[serde(default = "default_retention_days")]
    pub retention_days: u32,
}

fn default_retention_days() -> u32 {
    DEFAULT_RETENTION_DAYS
}

fn default_interval() -> u64 {
    DEFAULT_INTERVAL
}

impl Default for MonitorSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            interval_seconds: DEFAULT_INTERVAL,
            rules: RuleConfig::defaults(),
            retention_days: DEFAULT_RETENTION_DAYS,
        }
    }
}

impl MonitorSettings {
    pub fn normalized(mut self) -> Self {
        self.interval_seconds = self.interval_seconds.clamp(MIN_INTERVAL, MAX_INTERVAL);
        self.retention_days = self.retention_days.clamp(MIN_RETENTION_DAYS, MAX_RETENTION_DAYS);
        if self.rules.is_empty() {
            self.rules = RuleConfig::defaults();
        }
        self
    }
}

pub fn load_settings(app: &AppHandle) -> Result<MonitorSettings, String> {
    let path = data_dir(app)?.join(FILE_NAME);
    if !path.exists() {
        return Ok(MonitorSettings::default());
    }
    let raw = fs::read_to_string(&path).map_err(|error| format!("Could not read monitor settings: {error}"))?;
    let parsed: MonitorSettings =
        serde_json::from_str(&raw).map_err(|error| format!("Monitor settings file is invalid: {error}"))?;
    Ok(parsed.normalized())
}

pub fn save_settings(app: &AppHandle, settings: MonitorSettings) -> Result<MonitorSettings, String> {
    let settings = settings.normalized();
    let path = data_dir(app)?.join(FILE_NAME);
    let json = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    fs::write(&path, json).map_err(|error| format!("Could not save monitor settings: {error}"))?;
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_interval() {
        let settings = MonitorSettings {
            enabled: true,
            interval_seconds: 999,
            rules: RuleConfig::defaults(),
            retention_days: DEFAULT_RETENTION_DAYS,
        }
        .normalized();
        assert_eq!(settings.interval_seconds, MAX_INTERVAL);
    }
}
