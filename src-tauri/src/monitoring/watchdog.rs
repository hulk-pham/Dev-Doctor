use crate::history::data_dir;
use crate::monitoring::alert_manager::{AlertEvent, AlertManager};
use crate::monitoring::evaluator::{evaluate_rules, ArtifactGrowthHit, EvalContext, EvaluatorState};
use crate::monitoring::metrics::MonitorSample;
use crate::monitoring::rules::{RuleConfig, RuleParams};
use crate::monitoring::scheduler::WatchdogScheduler;
use crate::probe::inspect_listen_port;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use tauri::AppHandle;

pub struct WatchdogState {
    pub evaluator: EvaluatorState,
    pub alerts: AlertManager,
    pub scheduler: WatchdogScheduler,
}

impl WatchdogState {
    pub fn new() -> Self {
        Self {
            evaluator: EvaluatorState::default(),
            alerts: AlertManager::new(),
            scheduler: WatchdogScheduler::default(),
        }
    }

    pub fn on_sample(
        &mut self,
        app: &AppHandle,
        rules: &[RuleConfig],
        ring: &[MonitorSample],
        sample: &MonitorSample,
        interval_seconds: u64,
    ) -> Vec<AlertEvent> {
        let jobs = self.scheduler.on_tick(interval_seconds);
        let mut ctx = EvalContext {
            now_ms: sample.at_ms,
            ..Default::default()
        };
        if jobs.check_watched_ports {
            ctx.watched_ports_in_use = watched_ports_in_use(rules);
        }
        if jobs.check_artifact_growth {
            ctx.artifact_growth = artifact_growth_from_history(app).unwrap_or_default();
        }

        let hits = evaluate_rules(rules, ring, sample, &ctx, &mut self.evaluator);
        let active_keys: Vec<String> = hits.iter().map(|hit| hit.cause_key.clone()).collect();
        let cooldowns = cooldown_map(rules);
        self.alerts
            .process_hits(&hits, &active_keys, sample.at_ms, &cooldowns)
    }
}

fn cooldown_map(rules: &[RuleConfig]) -> HashMap<String, u64> {
    rules
        .iter()
        .map(|rule| (rule.id.clone(), rule.cooldown_seconds))
        .collect()
}

fn watched_ports_in_use(rules: &[RuleConfig]) -> Vec<(u16, Option<u32>, Option<String>)> {
    let mut ports = Vec::new();
    for rule in rules {
        if let RuleParams::WatchedPort { ports: watched } = &rule.params {
            ports.extend(watched.iter().copied());
        }
    }
    ports.sort_unstable();
    ports.dedup();
    ports
        .into_iter()
        .filter_map(|port| {
            let inspection = inspect_listen_port(port).ok()?;
            if !inspection.listening {
                return None;
            }
            Some((port, inspection.pid, inspection.process_name))
        })
        .collect()
}

fn artifact_growth_from_history(app: &AppHandle) -> Result<Vec<ArtifactGrowthHit>, String> {
    let path = data_dir(app)?.join("scan-history.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let parsed: Value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    let entries = parsed
        .get("entries")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let mut by_project: HashMap<String, Vec<u64>> = HashMap::new();
    for entry in entries {
        let Some(obj) = entry.as_object() else { continue };
        let path = obj.get("projectPath").and_then(|v| v.as_str()).unwrap_or("");
        if path.is_empty() {
            continue;
        }
        let bytes = obj
            .get("artifactListedBytes")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        by_project.entry(path.to_string()).or_default().push(bytes);
    }
    let mut hits = Vec::new();
    for (project_path, mut values) in by_project {
        if values.len() < 2 {
            continue;
        }
        values.sort_unstable();
        let previous = values[values.len() - 2];
        let current = values[values.len() - 1];
        hits.push(ArtifactGrowthHit {
            project_path,
            previous_bytes: previous,
            current_bytes: current,
        });
    }
    Ok(hits)
}
