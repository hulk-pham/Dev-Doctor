use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSample {
    pub cpu_percent: Option<f32>,
    pub memory_pressure: Option<MemoryPressureSample>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryPressureSample {
    /// macOS `vm.memory_pressure`: 0 normal, 1 warn, 2 critical when present.
    pub vm_pressure: Option<u32>,
    /// macOS `kern.memorystatus_level` 0–100 when present.
    pub status_level: Option<u32>,
    pub swap_used_bytes: Option<u64>,
    pub swap_total_bytes: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskSample {
    pub mount_point: String,
    pub total_bytes: Option<u64>,
    pub available_bytes: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessSample {
    pub pid: u32,
    pub start_time: u64,
    pub exe_path: Option<String>,
    pub name: String,
    pub cpu_percent: Option<f32>,
    pub memory_bytes: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorSample {
    pub at_ms: u64,
    pub system: SystemSample,
    pub disk: DiskSample,
    pub processes: Vec<ProcessSample>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn monitor_sample_round_trips_json() {
        let sample = MonitorSample {
            at_ms: 1_700_000_000_000,
            system: SystemSample {
                cpu_percent: Some(12.5),
                memory_pressure: Some(MemoryPressureSample {
                    vm_pressure: Some(0),
                    status_level: Some(73),
                    swap_used_bytes: Some(0),
                    swap_total_bytes: Some(0),
                }),
            },
            disk: DiskSample {
                mount_point: "/".into(),
                total_bytes: Some(500_000_000_000),
                available_bytes: None,
            },
            processes: vec![ProcessSample {
                pid: 42,
                start_time: 1_791_650_000,
                exe_path: Some("/bin/sh".into()),
                name: "sh".into(),
                cpu_percent: Some(1.2),
                memory_bytes: Some(1024),
            }],
        };
        let json = serde_json::to_string(&sample).expect("serialize");
        let back: MonitorSample = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(sample, back);
    }
}
