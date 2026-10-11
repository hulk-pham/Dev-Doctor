use crate::monitoring::rules::{AlertSeverity, RuleHit};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AlertState {
    Active,
    Recovered,
    Dismissed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorAlert {
    pub id: String,
    pub rule_id: String,
    pub cause_key: String,
    pub state: AlertState,
    pub severity: AlertSeverity,
    pub title: String,
    pub summary: String,
    pub evidence: Vec<String>,
    pub fired_at_ms: u64,
    pub recovered_at_ms: Option<u64>,
    pub updated_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertEvent {
    pub kind: AlertEventKind,
    pub alert: MonitorAlert,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AlertEventKind {
    Fired,
    Updated,
    Recovered,
}

pub struct AlertManager {
    alerts: Vec<MonitorAlert>,
    muted_rules: HashSet<String>,
    last_fired_ms: HashMap<String, u64>,
    next_id: u64,
}

impl AlertManager {
    pub fn new() -> Self {
        Self {
            alerts: Vec::new(),
            muted_rules: HashSet::new(),
            last_fired_ms: HashMap::new(),
            next_id: 1,
        }
    }

    pub fn alerts(&self) -> &[MonitorAlert] {
        &self.alerts
    }

    pub fn replace_all(&mut self, alerts: Vec<MonitorAlert>) {
        self.next_id = alerts
            .iter()
            .filter_map(|alert| alert.id.strip_prefix("alert-").and_then(|suffix| suffix.parse::<u64>().ok()))
            .max()
            .map(|max| max + 1)
            .unwrap_or(1);
        self.alerts = alerts;
    }

    pub fn mute_rule(&mut self, rule_id: &str) {
        self.muted_rules.insert(rule_id.to_string());
    }

    pub fn dismiss(&mut self, alert_id: &str, at_ms: u64) -> Option<MonitorAlert> {
        let alert = self.alerts.iter_mut().find(|alert| alert.id == alert_id)?;
        alert.state = AlertState::Dismissed;
        alert.updated_at_ms = at_ms;
        Some(alert.clone())
    }

    pub fn process_hits(
        &mut self,
        hits: &[RuleHit],
        active_cause_keys: &[String],
        now_ms: u64,
        cooldowns: &HashMap<String, u64>,
    ) -> Vec<AlertEvent> {
        let mut events = Vec::new();
        for hit in hits {
            if self.muted_rules.contains(&hit.rule_id) {
                continue;
            }
            if let Some(existing) = self
                .alerts
                .iter_mut()
                .find(|alert| alert.cause_key == hit.cause_key && alert.state == AlertState::Active)
            {
                existing.summary = hit.summary.clone();
                existing.evidence = hit.evidence.clone();
                existing.updated_at_ms = now_ms;
                events.push(AlertEvent {
                    kind: AlertEventKind::Updated,
                    alert: existing.clone(),
                });
                continue;
            }
            if let Some(cooldown) = cooldowns.get(&hit.rule_id) {
                if let Some(last) = self.last_fired_ms.get(&hit.cause_key) {
                    if now_ms.saturating_sub(*last) < *cooldown * 1000 {
                        continue;
                    }
                }
            }
            let id = format!("alert-{}", self.next_id);
            self.next_id += 1;
            let alert = MonitorAlert {
                id,
                rule_id: hit.rule_id.clone(),
                cause_key: hit.cause_key.clone(),
                state: AlertState::Active,
                severity: hit.severity,
                title: hit.title.clone(),
                summary: hit.summary.clone(),
                evidence: hit.evidence.clone(),
                fired_at_ms: now_ms,
                recovered_at_ms: None,
                updated_at_ms: now_ms,
            };
            self.last_fired_ms.insert(hit.cause_key.clone(), now_ms);
            self.alerts.push(alert.clone());
            events.push(AlertEvent {
                kind: AlertEventKind::Fired,
                alert,
            });
        }

        for alert in self.alerts.iter_mut().filter(|alert| alert.state == AlertState::Active) {
            if active_cause_keys.iter().any(|key| key == &alert.cause_key) {
                continue;
            }
            alert.state = AlertState::Recovered;
            alert.recovered_at_ms = Some(now_ms);
            alert.updated_at_ms = now_ms;
            events.push(AlertEvent {
                kind: AlertEventKind::Recovered,
                alert: alert.clone(),
            });
        }
        events
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::monitoring::rules::RuleHit;

    fn hit(cause: &str, rule: &str) -> RuleHit {
        RuleHit {
            rule_id: rule.into(),
            cause_key: cause.into(),
            severity: AlertSeverity::Warning,
            title: "Test".into(),
            summary: "Summary".into(),
            evidence: vec!["e1".into()],
        }
    }

    #[test]
    fn no_repeat_inside_cooldown() {
        let mut manager = AlertManager::new();
        let mut cooldowns = HashMap::new();
        cooldowns.insert("cpu-high".into(), 300);
        manager.process_hits(&[hit("cpu-high", "cpu-high")], &["cpu-high".into()], 1_000, &cooldowns);
        manager.process_hits(&[], &[], 2_000, &cooldowns);
        let again = manager.process_hits(&[hit("cpu-high", "cpu-high")], &["cpu-high".into()], 3_000, &cooldowns);
        assert!(again.is_empty());
    }

    #[test]
    fn recovers_when_cause_missing() {
        let mut manager = AlertManager::new();
        manager.process_hits(&[hit("low-disk", "low-disk")], &["low-disk".into()], 1_000, &HashMap::new());
        let events = manager.process_hits(&[], &[], 2_000, &HashMap::new());
        assert!(events.iter().any(|event| event.kind == AlertEventKind::Recovered));
    }
}
