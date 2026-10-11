use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AlertSeverity {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleConfig {
    pub id: String,
    pub enabled: bool,
    pub severity: AlertSeverity,
    /// Consecutive qualifying samples before firing.
    pub min_consecutive_samples: u32,
    pub cooldown_seconds: u64,
    pub params: RuleParams,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RuleParams {
    CpuHigh { threshold_percent: f32 },
    MemoryGrowth { min_increase_bytes: u64, min_increase_ratio: f32 },
    LowDisk { min_available_bytes: u64 },
    LongRunningDev { min_age_seconds: u64 },
    WatchedPort { ports: Vec<u16> },
    ArtifactGrowth { min_increase_ratio: f32 },
}

impl RuleConfig {
    pub fn defaults() -> Vec<Self> {
        vec![
            RuleConfig {
                id: "cpu-high".into(),
                enabled: true,
                severity: AlertSeverity::Warning,
                min_consecutive_samples: 3,
                cooldown_seconds: 300,
                params: RuleParams::CpuHigh {
                    threshold_percent: 85.0,
                },
            },
            RuleConfig {
                id: "memory-growth".into(),
                enabled: true,
                severity: AlertSeverity::Warning,
                min_consecutive_samples: 3,
                cooldown_seconds: 600,
                params: RuleParams::MemoryGrowth {
                    min_increase_bytes: 100 * 1024 * 1024,
                    min_increase_ratio: 0.2,
                },
            },
            RuleConfig {
                id: "low-disk".into(),
                enabled: true,
                severity: AlertSeverity::Error,
                min_consecutive_samples: 1,
                cooldown_seconds: 3600,
                params: RuleParams::LowDisk {
                    min_available_bytes: 10 * 1024 * 1024 * 1024,
                },
            },
            RuleConfig {
                id: "long-running-dev".into(),
                enabled: true,
                severity: AlertSeverity::Info,
                min_consecutive_samples: 1,
                cooldown_seconds: 86400,
                params: RuleParams::LongRunningDev {
                    min_age_seconds: 24 * 3600,
                },
            },
            RuleConfig {
                id: "watched-port".into(),
                enabled: true,
                severity: AlertSeverity::Warning,
                min_consecutive_samples: 1,
                cooldown_seconds: 300,
                params: RuleParams::WatchedPort { ports: vec![3000, 5173] },
            },
            RuleConfig {
                id: "artifact-growth".into(),
                enabled: true,
                severity: AlertSeverity::Info,
                min_consecutive_samples: 1,
                cooldown_seconds: 86400,
                params: RuleParams::ArtifactGrowth {
                    min_increase_ratio: 0.1,
                },
            },
        ]
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleHit {
    pub rule_id: String,
    pub cause_key: String,
    pub severity: AlertSeverity,
    pub title: String,
    pub summary: String,
    pub evidence: Vec<String>,
}
