use crate::monitoring::metrics::{MonitorSample, ProcessSample};
use crate::monitoring::rules::{RuleConfig, RuleHit, RuleParams};
use crate::processes::DEV_NAMES;
use std::collections::HashMap;

#[derive(Debug, Clone, Default)]
pub struct EvaluatorState {
    memory_streaks: HashMap<String, u32>,
    last_process_memory: HashMap<String, u64>,
}

#[derive(Debug, Clone, Default)]
pub struct EvalContext {
    pub now_ms: u64,
    pub watched_ports_in_use: Vec<(u16, Option<u32>, Option<String>)>,
    pub artifact_growth: Vec<ArtifactGrowthHit>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ArtifactGrowthHit {
    pub project_path: String,
    pub previous_bytes: u64,
    pub current_bytes: u64,
}

pub fn evaluate_rules(
    rules: &[RuleConfig],
    ring: &[MonitorSample],
    latest: &MonitorSample,
    ctx: &EvalContext,
    state: &mut EvaluatorState,
) -> Vec<RuleHit> {
    let mut hits = Vec::new();
    for rule in rules.iter().filter(|rule| rule.enabled) {
        match &rule.params {
            RuleParams::CpuHigh { threshold_percent } => {
                if let Some(hit) = eval_cpu_high(rule, ring, latest, state, *threshold_percent) {
                    hits.push(hit);
                }
            }
            RuleParams::MemoryGrowth {
                min_increase_bytes,
                min_increase_ratio,
            } => {
                hits.extend(eval_memory_growth(
                    rule,
                    ring,
                    latest,
                    state,
                    *min_increase_bytes,
                    *min_increase_ratio,
                ));
            }
            RuleParams::LowDisk { min_available_bytes } => {
                if let Some(hit) = eval_low_disk(rule, ring, latest, state, *min_available_bytes) {
                    hits.push(hit);
                }
            }
            RuleParams::LongRunningDev { min_age_seconds } => {
                hits.extend(eval_long_running_dev(rule, latest, ctx, *min_age_seconds));
            }
            RuleParams::WatchedPort { ports } => {
                hits.extend(eval_watched_ports(rule, ctx, ports));
            }
            RuleParams::ArtifactGrowth { min_increase_ratio } => {
                hits.extend(eval_artifact_growth(rule, ctx, *min_increase_ratio));
            }
        }
    }
    hits
}

fn eval_cpu_high(
    rule: &RuleConfig,
    ring: &[MonitorSample],
    latest: &MonitorSample,
    _state: &mut EvaluatorState,
    threshold: f32,
) -> Option<RuleHit> {
    let cpu = latest.system.cpu_percent?;
    if cpu < threshold {
        return None;
    }
    let consecutive = consecutive_tail(ring, |sample| {
        sample
            .system
            .cpu_percent
            .is_some_and(|value| value >= threshold)
    });
    if consecutive < rule.min_consecutive_samples {
        return None;
    }
    let window: Vec<String> = ring
        .iter()
        .rev()
        .take(rule.min_consecutive_samples as usize)
        .filter_map(|sample| sample.system.cpu_percent.map(|value| format!("{value:.1}%")))
        .collect();
    Some(RuleHit {
        rule_id: rule.id.clone(),
        cause_key: "cpu-high".into(),
        severity: rule.severity,
        title: "Sustained high CPU".into(),
        summary: format!("Machine CPU stayed at or above {threshold:.0}% for several samples."),
        evidence: vec![
            format!("Latest: {cpu:.1}%"),
            format!("Recent samples: {}", window.join(", ")),
        ],
    })
}

fn eval_low_disk(
    rule: &RuleConfig,
    ring: &[MonitorSample],
    latest: &MonitorSample,
    _state: &mut EvaluatorState,
    min_available: u64,
) -> Option<RuleHit> {
    let available = latest.disk.available_bytes?;
    if available >= min_available {
        return None;
    }
    let consecutive = consecutive_tail(ring, |sample| {
        sample
            .disk
            .available_bytes
            .is_some_and(|value| value < min_available)
    });
    if consecutive < rule.min_consecutive_samples {
        return None;
    }
    Some(RuleHit {
        rule_id: rule.id.clone(),
        cause_key: "low-disk".into(),
        severity: rule.severity,
        title: "Low disk space".into(),
        summary: "Boot volume free space fell below the configured threshold.".into(),
        evidence: vec![
            format!("Available: {available} bytes"),
            format!("Threshold: {min_available} bytes"),
            format!("Mount: {}", latest.disk.mount_point),
        ],
    })
}

fn process_key(process: &ProcessSample) -> String {
    format!("{}:{}:{}", process.pid, process.start_time, process.exe_path.as_deref().unwrap_or(""))
}

fn is_dev_process(name: &str) -> bool {
    let lower = name.to_lowercase();
    DEV_NAMES.iter().any(|candidate| lower.contains(candidate))
}

fn eval_memory_growth(
    rule: &RuleConfig,
    ring: &[MonitorSample],
    latest: &MonitorSample,
    state: &mut EvaluatorState,
    min_bytes: u64,
    min_ratio: f32,
) -> Vec<RuleHit> {
    let mut hits = Vec::new();
    for process in &latest.processes {
        if !is_dev_process(&process.name) {
            continue;
        }
        let Some(current) = process.memory_bytes else { continue };
        let key = process_key(process);
        let previous = state.last_process_memory.get(&key).copied();
        state.last_process_memory.insert(key.clone(), current);

        let mut growing = false;
        if let Some(prev) = previous {
            if prev == 0 {
                continue;
            }
            let delta = current.saturating_sub(prev);
            let ratio = delta as f32 / prev as f32;
            growing = delta >= min_bytes && ratio >= min_ratio;
        }

        let streak = state.memory_streaks.entry(key.clone()).or_insert(0);
        if growing {
            *streak += 1;
        } else {
            *streak = 0;
            continue;
        }
        if *streak < rule.min_consecutive_samples {
            continue;
        }

        let window = memory_window(ring, &key, rule.min_consecutive_samples);
        hits.push(RuleHit {
            rule_id: rule.id.clone(),
            cause_key: format!("memory-growth:{key}"),
            severity: rule.severity,
            title: "Rising process memory".into(),
            summary: format!(
                "{} (PID {}) — footprint rose across recent samples. This is growth, not a confirmed leak.",
                process.name, process.pid
            ),
            evidence: window,
        });
    }
    hits
}

fn memory_window(ring: &[MonitorSample], key: &str, count: u32) -> Vec<String> {
    ring.iter()
        .rev()
        .take(count as usize)
        .filter_map(|sample| {
            sample.processes.iter().find(|p| process_key(p) == key).and_then(|p| {
                p.memory_bytes.map(|bytes| format!("{} B at {}", bytes, sample.at_ms))
            })
        })
        .collect()
}

fn eval_long_running_dev(
    rule: &RuleConfig,
    latest: &MonitorSample,
    ctx: &EvalContext,
    min_age_seconds: u64,
) -> Vec<RuleHit> {
    let now_secs = ctx.now_ms / 1000;
    latest
        .processes
        .iter()
        .filter(|process| is_dev_process(&process.name))
        .filter_map(|process| {
            let age = now_secs.saturating_sub(process.start_time);
            if age < min_age_seconds {
                return None;
            }
            Some(RuleHit {
                rule_id: rule.id.clone(),
                cause_key: format!("long-dev:{}:{}", process.pid, process.start_time),
                severity: rule.severity,
                title: "Long-running dev process".into(),
                summary: format!(
                    "{} (PID {}) has been running for about {} hours.",
                    process.name,
                    process.pid,
                    age / 3600
                ),
                evidence: vec![
                    format!("Start time (unix s): {}", process.start_time),
                    process
                        .exe_path
                        .clone()
                        .map(|path| format!("Executable: {path}"))
                        .unwrap_or_else(|| "Executable: unknown".into()),
                ],
            })
        })
        .collect()
}

fn eval_watched_ports(rule: &RuleConfig, ctx: &EvalContext, ports: &[u16]) -> Vec<RuleHit> {
    ports
        .iter()
        .filter_map(|port| {
            let hit = ctx
                .watched_ports_in_use
                .iter()
                .find(|(candidate, _, _)| candidate == port)?;
            let (_port, pid, name) = hit;
            Some(RuleHit {
                rule_id: rule.id.clone(),
                cause_key: format!("watched-port:{port}"),
                severity: rule.severity,
                title: format!("Port {port} is in use"),
                summary: "A watched port has a listener.".into(),
                evidence: vec![
                    format!("Port: {port}"),
                    pid.map(|value| format!("PID: {value}"))
                        .unwrap_or_else(|| "PID: unknown".into()),
                    name.clone()
                        .map(|value| format!("Process: {value}"))
                        .unwrap_or_else(|| "Process: unknown".into()),
                ],
            })
        })
        .collect()
}

fn eval_artifact_growth(rule: &RuleConfig, ctx: &EvalContext, min_ratio: f32) -> Vec<RuleHit> {
    ctx.artifact_growth
        .iter()
        .filter(|hit| {
            hit.previous_bytes > 0
                && hit.current_bytes > hit.previous_bytes
                && (hit.current_bytes - hit.previous_bytes) as f32 / hit.previous_bytes as f32 >= min_ratio
        })
        .map(|hit| {
            let delta = hit.current_bytes.saturating_sub(hit.previous_bytes);
            RuleHit {
                rule_id: rule.id.clone(),
                cause_key: format!("artifact-growth:{}", hit.project_path),
                severity: rule.severity,
                title: "Artifact total grew between scans".into(),
                summary: format!("Measured reclaimable total increased for {}.", hit.project_path),
                evidence: vec![
                    format!("Previous: {} bytes", hit.previous_bytes),
                    format!("Current: {} bytes", hit.current_bytes),
                    format!("Delta: {delta} bytes"),
                ],
            }
        })
        .collect()
}

fn consecutive_tail(ring: &[MonitorSample], mut qualifies: impl FnMut(&MonitorSample) -> bool) -> u32 {
    ring.iter()
        .rev()
        .take_while(|sample| qualifies(sample))
        .count() as u32
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::monitoring::metrics::{DiskSample, MemoryPressureSample, SystemSample};

    fn sample(at: u64, cpu: Option<f32>, disk_free: Option<u64>) -> MonitorSample {
        MonitorSample {
            at_ms: at,
            system: SystemSample {
                cpu_percent: cpu,
                memory_pressure: Some(MemoryPressureSample {
                    vm_pressure: Some(0),
                    status_level: Some(70),
                    swap_used_bytes: None,
                    swap_total_bytes: None,
                }),
            },
            disk: DiskSample {
                mount_point: "/".into(),
                total_bytes: Some(500_000_000_000),
                available_bytes: disk_free,
            },
            processes: vec![],
        }
    }

    fn cpu_rule() -> RuleConfig {
        RuleConfig::defaults()
            .into_iter()
            .find(|rule| rule.id == "cpu-high")
            .expect("cpu rule")
    }

    #[test]
    fn cpu_triggers_after_consecutive_high_samples() {
        let rule = cpu_rule();
        let mut state = EvaluatorState::default();
        let ring = vec![
            sample(1, Some(90.0), None),
            sample(2, Some(92.0), None),
            sample(3, Some(94.0), None),
        ];
        let latest = ring.last().unwrap();
        let hits = evaluate_rules(&[rule.clone()], &ring, latest, &EvalContext::default(), &mut state);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].cause_key, "cpu-high");
    }

    #[test]
    fn cpu_does_not_trigger_on_single_spike() {
        let rule = cpu_rule();
        let ring = vec![sample(1, Some(90.0), None)];
        let hits = evaluate_rules(
            &[rule],
            &ring,
            &ring[0],
            &EvalContext::default(),
            &mut EvaluatorState::default(),
        );
        assert!(hits.is_empty());
    }

    #[test]
    fn low_disk_triggers_when_below_threshold() {
        let rule = RuleConfig::defaults()
            .into_iter()
            .find(|rule| rule.id == "low-disk")
            .expect("disk");
        let mut state = EvaluatorState::default();
        let latest = sample(1, None, Some(8 * 1024 * 1024 * 1024));
        let ring = vec![latest.clone()];
        let hits = evaluate_rules(&[rule], &ring, &latest, &EvalContext::default(), &mut state);
        assert_eq!(hits.len(), 1);
    }

    #[test]
    fn watched_port_hit_when_listener_present() {
        let rule = RuleConfig::defaults()
            .into_iter()
            .find(|rule| rule.id == "watched-port")
            .expect("port");
        let ctx = EvalContext {
            watched_ports_in_use: vec![(5173, Some(42), Some("node".into()))],
            ..Default::default()
        };
        let latest = sample(1, None, None);
        let hits = evaluate_rules(&[rule], &[], &latest, &ctx, &mut EvaluatorState::default());
        assert!(hits.iter().any(|hit| hit.cause_key.contains("5173")));
    }
}
