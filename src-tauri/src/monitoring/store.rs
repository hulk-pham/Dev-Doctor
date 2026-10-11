use crate::history::data_dir;
use crate::monitoring::alert_manager::{AlertEvent, AlertEventKind, AlertState, MonitorAlert};
use crate::monitoring::metrics::{DiskSample, MemoryPressureSample, MonitorSample, ProcessSample, SystemSample};
use crate::monitoring::rules::RuleConfig;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::AppHandle;

pub const SCHEMA_VERSION: i32 = 1;
const DB_FILE: &str = "monitor-history.sqlite";

const RAW_RETENTION_MS: u64 = 24 * 60 * 60 * 1000;
const MINUTE_RETENTION_MS: u64 = 7 * 24 * 60 * 60 * 1000;

type AggRow = (u64, Option<f32>, Option<i64>, Option<i64>, Option<i64>, Option<i64>, String, Option<i64>, Option<i64>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorStorageStatus {
    pub available: bool,
    pub degraded: bool,
    pub message: Option<String>,
    pub sample_count: usize,
    pub alert_count: usize,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertHistoryQuery {
    pub state: Option<String>,
    pub rule_id: Option<String>,
    pub since_ms: Option<u64>,
    pub until_ms: Option<u64>,
}

pub struct MonitorDb {
    conn: Connection,
}

pub struct MonitorStorage {
    db: Option<MonitorDb>,
    pub degraded_message: Option<String>,
}

impl MonitorStorage {
    pub fn open(app: &AppHandle) -> Arc<Mutex<Self>> {
        Arc::new(Mutex::new(Self::open_inner(app)))
    }

    fn open_inner(app: &AppHandle) -> Self {
        match data_dir(app).and_then(|dir| MonitorDb::open(dir.join(DB_FILE))) {
            Ok(db) => Self {
                db: Some(db),
                degraded_message: None,
            },
            Err(error) => Self {
                db: None,
                degraded_message: Some(error),
            },
        }
    }

    pub fn is_available(&self) -> bool {
        self.db.is_some()
    }

    pub fn status(&self) -> MonitorStorageStatus {
        match &self.db {
            Some(db) => {
                let sample_count = db.sample_count().unwrap_or(0);
                let alert_count = db.alert_count().unwrap_or(0);
                MonitorStorageStatus {
                    available: true,
                    degraded: false,
                    message: None,
                    sample_count,
                    alert_count,
                }
            }
            None => MonitorStorageStatus {
                available: false,
                degraded: true,
                message: self.degraded_message.clone(),
                sample_count: 0,
                alert_count: 0,
            },
        }
    }

    pub fn with_db<F, T>(&mut self, action: F) -> Option<T>
    where
        F: FnOnce(&mut MonitorDb) -> Result<T, String>,
    {
        let db = self.db.as_mut()?;
        match action(db) {
            Ok(value) => Some(value),
            Err(error) => {
                self.degraded_message = Some(error);
                self.db = None;
                None
            }
        }
    }

    pub fn clear_all(&mut self) -> Result<(), String> {
        let db = self.db.as_mut().ok_or_else(|| "Monitor database unavailable.".to_string())?;
        db.clear_all()?;
        Ok(())
    }
}

impl MonitorDb {
    pub fn open(path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create monitor database folder: {error}"))?;
        }
        let conn = Connection::open(&path).map_err(|error| format!("Could not open monitor database: {error}"))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|error| format!("Could not configure monitor database: {error}"))?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    pub fn open_in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory().map_err(|error| error.to_string())?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<(), String> {
        let version: i32 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='schema_version'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        if version == 0 {
            self.apply_v1()?;
            return Ok(());
        }
        let current: i32 = self
            .conn
            .query_row("SELECT version FROM schema_version LIMIT 1", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        if current != SCHEMA_VERSION {
            return Err(format!("Unsupported monitor schema version {current}."));
        }
        Ok(())
    }

    fn apply_v1(&self) -> Result<(), String> {
        self.conn
            .execute_batch(
                "
                CREATE TABLE schema_version (version INTEGER NOT NULL);
                INSERT INTO schema_version (version) VALUES (1);

                CREATE TABLE monitor_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    started_at_ms INTEGER NOT NULL,
                    ended_at_ms INTEGER
                );

                CREATE TABLE metric_samples (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER,
                    at_ms INTEGER NOT NULL,
                    resolution TEXT NOT NULL,
                    cpu_percent REAL,
                    memory_status_level INTEGER,
                    vm_pressure INTEGER,
                    swap_used_bytes INTEGER,
                    swap_total_bytes INTEGER,
                    disk_mount TEXT,
                    disk_total_bytes INTEGER,
                    disk_available_bytes INTEGER,
                    processes_json TEXT,
                    FOREIGN KEY (session_id) REFERENCES monitor_sessions(id)
                );
                CREATE INDEX idx_metric_samples_time ON metric_samples(at_ms, resolution);

                CREATE TABLE alerts (
                    id TEXT PRIMARY KEY,
                    rule_id TEXT NOT NULL,
                    cause_key TEXT NOT NULL,
                    state TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    title TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    evidence_json TEXT NOT NULL,
                    fired_at_ms INTEGER NOT NULL,
                    recovered_at_ms INTEGER,
                    updated_at_ms INTEGER NOT NULL
                );
                CREATE INDEX idx_alerts_updated ON alerts(updated_at_ms);

                CREATE TABLE alert_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    alert_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    at_ms INTEGER NOT NULL,
                    FOREIGN KEY (alert_id) REFERENCES alerts(id)
                );

                CREATE TABLE monitor_rules (
                    id TEXT PRIMARY KEY,
                    enabled INTEGER NOT NULL,
                    config_json TEXT NOT NULL,
                    updated_at_ms INTEGER NOT NULL
                );
                ",
            )
            .map_err(|error| error.to_string())
    }

    pub fn schema_version(&self) -> Result<i32, String> {
        self.conn
            .query_row("SELECT version FROM schema_version LIMIT 1", [], |row| row.get(0))
            .map_err(|error| error.to_string())
    }

    pub fn start_session(&mut self, at_ms: u64) -> Result<i64, String> {
        self.conn
            .execute("INSERT INTO monitor_sessions (started_at_ms) VALUES (?1)", params![at_ms as i64])
            .map_err(|error| error.to_string())?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn end_session(&mut self, session_id: i64, at_ms: u64) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE monitor_sessions SET ended_at_ms = ?1 WHERE id = ?2",
                params![at_ms as i64, session_id],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn insert_sample(&mut self, session_id: Option<i64>, resolution: &str, sample: &MonitorSample) -> Result<(), String> {
        let processes_json = if resolution == "raw" && !sample.processes.is_empty() {
            Some(serde_json::to_string(&sample.processes).map_err(|error| error.to_string())?)
        } else {
            None
        };
        let pressure = sample.system.memory_pressure.as_ref();
        self.conn
            .execute(
                "INSERT INTO metric_samples (
                    session_id, at_ms, resolution, cpu_percent, memory_status_level, vm_pressure,
                    swap_used_bytes, swap_total_bytes, disk_mount, disk_total_bytes, disk_available_bytes, processes_json
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    session_id,
                    sample.at_ms as i64,
                    resolution,
                    sample.system.cpu_percent,
                    pressure.and_then(|p| p.status_level.map(|v| v as i64)),
                    pressure.and_then(|p| p.vm_pressure.map(|v| v as i64)),
                    pressure.and_then(|p| p.swap_used_bytes.map(|v| v as i64)),
                    pressure.and_then(|p| p.swap_total_bytes.map(|v| v as i64)),
                    sample.disk.mount_point,
                    sample.disk.total_bytes.map(|v| v as i64),
                    sample.disk.available_bytes.map(|v| v as i64),
                    processes_json,
                ],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn upsert_alert(&mut self, alert: &MonitorAlert) -> Result<(), String> {
        let evidence = serde_json::to_string(&alert.evidence).map_err(|error| error.to_string())?;
        let state = alert_state_str(alert.state);
        let severity = severity_str(alert.severity);
        self.conn
            .execute(
                "INSERT INTO alerts (
                    id, rule_id, cause_key, state, severity, title, summary, evidence_json,
                    fired_at_ms, recovered_at_ms, updated_at_ms
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                ON CONFLICT(id) DO UPDATE SET
                    state=excluded.state,
                    summary=excluded.summary,
                    evidence_json=excluded.evidence_json,
                    recovered_at_ms=excluded.recovered_at_ms,
                    updated_at_ms=excluded.updated_at_ms",
                params![
                    alert.id,
                    alert.rule_id,
                    alert.cause_key,
                    state,
                    severity,
                    alert.title,
                    alert.summary,
                    evidence,
                    alert.fired_at_ms as i64,
                    alert.recovered_at_ms.map(|v| v as i64),
                    alert.updated_at_ms as i64,
                ],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn insert_alert_event(&mut self, event: &AlertEvent) -> Result<(), String> {
        let kind = event_kind_str(event.kind);
        self.conn
            .execute(
                "INSERT INTO alert_events (alert_id, kind, at_ms) VALUES (?1, ?2, ?3)",
                params![event.alert.id, kind, event.alert.updated_at_ms as i64],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn sync_rules(&mut self, rules: &[RuleConfig], at_ms: u64) -> Result<(), String> {
        for rule in rules {
            let json = serde_json::to_string(rule).map_err(|error| error.to_string())?;
            self.conn
                .execute(
                    "INSERT INTO monitor_rules (id, enabled, config_json, updated_at_ms)
                     VALUES (?1, ?2, ?3, ?4)
                     ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled, config_json=excluded.config_json, updated_at_ms=excluded.updated_at_ms",
                    params![rule.id, i64::from(rule.enabled), json, at_ms as i64],
                )
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    pub fn load_alerts(&self) -> Result<Vec<MonitorAlert>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, rule_id, cause_key, state, severity, title, summary, evidence_json,
                        fired_at_ms, recovered_at_ms, updated_at_ms FROM alerts ORDER BY updated_at_ms DESC",
            )
            .map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let evidence_json: String = row.get(7)?;
                let evidence: Vec<String> = serde_json::from_str(&evidence_json).unwrap_or_default();
                Ok(MonitorAlert {
                    id: row.get(0)?,
                    rule_id: row.get(1)?,
                    cause_key: row.get(2)?,
                    state: parse_alert_state(row.get::<_, String>(3)?),
                    severity: parse_severity(row.get::<_, String>(4)?),
                    title: row.get(5)?,
                    summary: row.get(6)?,
                    evidence,
                    fired_at_ms: row.get::<_, i64>(8)? as u64,
                    recovered_at_ms: row.get::<_, Option<i64>>(9)?.map(|v| v as u64),
                    updated_at_ms: row.get::<_, i64>(10)? as u64,
                })
            })
            .map_err(|error| error.to_string())?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn query_alerts(&self, query: &AlertHistoryQuery) -> Result<Vec<MonitorAlert>, String> {
        let mut sql = String::from(
            "SELECT id, rule_id, cause_key, state, severity, title, summary, evidence_json,
                    fired_at_ms, recovered_at_ms, updated_at_ms FROM alerts WHERE 1=1",
        );
        let mut binds: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        if let Some(state) = &query.state {
            if state != "all" {
                sql.push_str(" AND state = ?");
                binds.push(Box::new(state.clone()));
            }
        }
        if let Some(rule_id) = &query.rule_id {
            if !rule_id.is_empty() {
                sql.push_str(" AND rule_id = ?");
                binds.push(Box::new(rule_id.clone()));
            }
        }
        if let Some(since) = query.since_ms {
            sql.push_str(" AND updated_at_ms >= ?");
            binds.push(Box::new(since as i64));
        }
        if let Some(until) = query.until_ms {
            sql.push_str(" AND updated_at_ms <= ?");
            binds.push(Box::new(until as i64));
        }
        sql.push_str(" ORDER BY updated_at_ms DESC LIMIT 500");
        let mut stmt = self.conn.prepare(&sql).map_err(|error| error.to_string())?;
        let params: Vec<&dyn rusqlite::types::ToSql> = binds.iter().map(|value| value.as_ref()).collect();
        let rows = stmt
            .query_map(params.as_slice(), |row| {
                let evidence_json: String = row.get(7)?;
                let evidence: Vec<String> = serde_json::from_str(&evidence_json).unwrap_or_default();
                Ok(MonitorAlert {
                    id: row.get(0)?,
                    rule_id: row.get(1)?,
                    cause_key: row.get(2)?,
                    state: parse_alert_state(row.get::<_, String>(3)?),
                    severity: parse_severity(row.get::<_, String>(4)?),
                    title: row.get(5)?,
                    summary: row.get(6)?,
                    evidence,
                    fired_at_ms: row.get::<_, i64>(8)? as u64,
                    recovered_at_ms: row.get::<_, Option<i64>>(9)?.map(|v| v as u64),
                    updated_at_ms: row.get::<_, i64>(10)? as u64,
                })
            })
            .map_err(|error| error.to_string())?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn samples_for_range(&self, since_ms: u64, until_ms: u64) -> Result<Vec<MonitorSample>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT at_ms, resolution, cpu_percent, memory_status_level, vm_pressure,
                        swap_used_bytes, swap_total_bytes, disk_mount, disk_total_bytes, disk_available_bytes, processes_json
                 FROM metric_samples
                 WHERE at_ms >= ?1 AND at_ms <= ?2
                 ORDER BY at_ms ASC",
            )
            .map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map(params![since_ms as i64, until_ms as i64], |row| row_to_sample(row))
            .map_err(|error| error.to_string())?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn compact(&mut self, retention_days: u32, now_ms: u64) -> Result<(), String> {
        let hourly_cutoff = now_ms.saturating_sub(retention_days as u64 * 24 * 60 * 60 * 1000);
        let raw_cutoff = now_ms.saturating_sub(RAW_RETENTION_MS);
        let minute_cutoff = now_ms.saturating_sub(MINUTE_RETENTION_MS);

        self.aggregate_resolution("raw", "1m", raw_cutoff, 60_000)?;
        self.conn
            .execute(
                "DELETE FROM metric_samples WHERE resolution = 'raw' AND at_ms < ?1",
                params![raw_cutoff as i64],
            )
            .map_err(|error| error.to_string())?;

        self.aggregate_resolution("1m", "1h", minute_cutoff, 3_600_000)?;
        self.conn
            .execute(
                "DELETE FROM metric_samples WHERE resolution = '1m' AND at_ms < ?1",
                params![minute_cutoff as i64],
            )
            .map_err(|error| error.to_string())?;

        self.conn
            .execute(
                "DELETE FROM metric_samples WHERE resolution = '1h' AND at_ms < ?1",
                params![hourly_cutoff as i64],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    fn aggregate_resolution(&mut self, from: &str, to: &str, cutoff_ms: u64, bucket_ms: u64) -> Result<(), String> {
        let rows: Vec<AggRow> = {
            let mut stmt = self
                .conn
                .prepare(
                    "SELECT at_ms, cpu_percent, memory_status_level, vm_pressure,
                            swap_used_bytes, swap_total_bytes, disk_mount, disk_total_bytes, disk_available_bytes
                     FROM metric_samples WHERE resolution = ?1 AND at_ms < ?2 ORDER BY at_ms ASC",
                )
                .map_err(|error| error.to_string())?;
            stmt.query_map(params![from, cutoff_ms as i64], |row| {
                Ok((
                    row.get::<_, i64>(0)? as u64,
                    row.get::<_, Option<f32>>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                    row.get::<_, Option<i64>>(3)?,
                    row.get::<_, Option<i64>>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, Option<i64>>(7)?,
                    row.get::<_, Option<i64>>(8)?,
                ))
            })
            .map_err(|error| error.to_string())?
            .filter_map(Result::ok)
            .collect()
        };

        if rows.is_empty() {
            return Ok(());
        }

        let mut bucket_start = (rows[0].0 / bucket_ms) * bucket_ms;
        let mut bucket_rows: Vec<AggRow> = Vec::new();

        for row in rows {
            let bucket = (row.0 / bucket_ms) * bucket_ms;
            if bucket != bucket_start {
                self.insert_aggregate_bucket(to, bucket_start, &bucket_rows)?;
                bucket_rows.clear();
                bucket_start = bucket;
            }
            bucket_rows.push(row);
        }
        self.insert_aggregate_bucket(to, bucket_start, &bucket_rows)?;
        Ok(())
    }

    fn insert_aggregate_bucket(&mut self, resolution: &str, start: u64, items: &[AggRow]) -> Result<(), String> {
        if items.is_empty() {
            return Ok(());
        }
        let cpu_avg = average_f32(items.iter().filter_map(|row| row.1));
        let status_avg = average_u64(items.iter().filter_map(|row| row.2.map(|v| v as u64)));
        let last = items.last().expect("non-empty");
        let sample = MonitorSample {
            at_ms: start,
            system: SystemSample {
                cpu_percent: cpu_avg,
                memory_pressure: Some(MemoryPressureSample {
                    vm_pressure: last.3.map(|v| v as u32),
                    status_level: status_avg.map(|v| v as u32),
                    swap_used_bytes: last.4.map(|v| v as u64),
                    swap_total_bytes: last.5.map(|v| v as u64),
                }),
            },
            disk: DiskSample {
                mount_point: last.6.clone(),
                total_bytes: last.7.map(|v| v as u64),
                available_bytes: last.8.map(|v| v as u64),
            },
            processes: Vec::new(),
        };
        self.insert_sample(None, resolution, &sample)
    }

    pub fn sample_count(&self) -> Result<usize, String> {
        self.conn
            .query_row("SELECT COUNT(*) FROM metric_samples", [], |row| row.get(0))
            .map_err(|error| error.to_string())
    }

    pub fn alert_count(&self) -> Result<usize, String> {
        self.conn
            .query_row("SELECT COUNT(*) FROM alerts", [], |row| row.get(0))
            .map_err(|error| error.to_string())
    }

    pub fn clear_all(&mut self) -> Result<(), String> {
        self.conn
            .execute_batch(
                "DELETE FROM alert_events;
                 DELETE FROM alerts;
                 DELETE FROM metric_samples;
                 DELETE FROM monitor_sessions;
                 DELETE FROM monitor_rules;",
            )
            .map_err(|error| error.to_string())
    }

    pub fn processes_at(&self, at_ms: u64) -> Result<Vec<ProcessSample>, String> {
        let json: Option<String> = self
            .conn
            .query_row(
                "SELECT processes_json FROM metric_samples
                 WHERE resolution = 'raw' AND at_ms = ?1 LIMIT 1",
                params![at_ms as i64],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        match json {
            Some(raw) => serde_json::from_str(&raw).map_err(|error| error.to_string()),
            None => Ok(Vec::new()),
        }
    }
}

fn row_to_sample(row: &rusqlite::Row<'_>) -> rusqlite::Result<MonitorSample> {
    let at_ms: i64 = row.get(0)?;
    let cpu: Option<f32> = row.get(2)?;
    let status: Option<i64> = row.get(3)?;
    let vm: Option<i64> = row.get(4)?;
    let swap_used: Option<i64> = row.get(5)?;
    let swap_total: Option<i64> = row.get(6)?;
    let mount: String = row.get(7)?;
    let total: Option<i64> = row.get(8)?;
    let available: Option<i64> = row.get(9)?;
    let processes_json: Option<String> = row.get(10)?;
    let processes: Vec<ProcessSample> = processes_json
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    Ok(MonitorSample {
        at_ms: at_ms as u64,
        system: SystemSample {
            cpu_percent: cpu,
            memory_pressure: if status.is_some() || vm.is_some() || swap_used.is_some() {
                Some(MemoryPressureSample {
                    vm_pressure: vm.map(|v| v as u32),
                    status_level: status.map(|v| v as u32),
                    swap_used_bytes: swap_used.map(|v| v as u64),
                    swap_total_bytes: swap_total.map(|v| v as u64),
                })
            } else {
                None
            },
        },
        disk: DiskSample {
            mount_point: mount,
            total_bytes: total.map(|v| v as u64),
            available_bytes: available.map(|v| v as u64),
        },
        processes,
    })
}

fn average_f32(values: impl Iterator<Item = f32>) -> Option<f32> {
    let mut count = 0usize;
    let mut sum = 0f32;
    for value in values {
        count += 1;
        sum += value;
    }
    if count == 0 {
        None
    } else {
        Some(sum / count as f32)
    }
}

fn average_u64(values: impl Iterator<Item = u64>) -> Option<u64> {
    let mut count = 0usize;
    let mut sum = 0u64;
    for value in values {
        count += 1;
        sum += value;
    }
    if count == 0 {
        None
    } else {
        Some(sum / count as u64)
    }
}

fn alert_state_str(state: AlertState) -> &'static str {
    match state {
        AlertState::Active => "active",
        AlertState::Recovered => "recovered",
        AlertState::Dismissed => "dismissed",
    }
}

fn parse_alert_state(raw: String) -> AlertState {
    match raw.as_str() {
        "recovered" => AlertState::Recovered,
        "dismissed" => AlertState::Dismissed,
        _ => AlertState::Active,
    }
}

fn severity_str(severity: crate::monitoring::rules::AlertSeverity) -> &'static str {
    use crate::monitoring::rules::AlertSeverity;
    match severity {
        AlertSeverity::Info => "info",
        AlertSeverity::Warning => "warning",
        AlertSeverity::Error => "error",
    }
}

fn parse_severity(raw: String) -> crate::monitoring::rules::AlertSeverity {
    use crate::monitoring::rules::AlertSeverity;
    match raw.as_str() {
        "error" => AlertSeverity::Error,
        "info" => AlertSeverity::Info,
        _ => AlertSeverity::Warning,
    }
}

fn event_kind_str(kind: AlertEventKind) -> &'static str {
    match kind {
        AlertEventKind::Fired => "fired",
        AlertEventKind::Updated => "updated",
        AlertEventKind::Recovered => "recovered",
    }
}

pub fn parse_range_ms(range: &str) -> Result<u64, String> {
    match range.trim().to_lowercase().as_str() {
        "15m" => Ok(15 * 60 * 1000),
        "1h" | "60m" => Ok(60 * 60 * 1000),
        "30m" => Ok(30 * 60 * 1000),
        other => Err(format!("Unknown monitor range: {other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::monitoring::rules::AlertSeverity;

    #[test]
    fn migration_v1_creates_schema_version() {
        let db = MonitorDb::open_in_memory().expect("memory db");
        assert_eq!(db.schema_version().expect("version"), SCHEMA_VERSION);
    }

    #[test]
    fn compacts_old_raw_rows_into_minute_buckets() {
        let mut db = MonitorDb::open_in_memory().expect("memory db");
        let base = 1_000_000_000_000u64;
        for offset in [60_000u64, 120_000, 180_000] {
            let sample = MonitorSample {
                at_ms: base.saturating_sub(RAW_RETENTION_MS + offset),
                system: SystemSample {
                    cpu_percent: Some(50.0),
                    memory_pressure: None,
                },
                disk: DiskSample {
                    mount_point: "/".into(),
                    total_bytes: Some(100),
                    available_bytes: Some(50),
                },
                processes: Vec::new(),
            };
            db.insert_sample(None, "raw", &sample).expect("insert");
        }
        let now = base;
        db.compact(30, now).expect("compact");
        let raw_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM metric_samples WHERE resolution = 'raw'",
                [],
                |row| row.get(0),
            )
            .expect("count");
        assert_eq!(raw_count, 0);
        let minute_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM metric_samples WHERE resolution = '1m'",
                [],
                |row| row.get(0),
            )
            .expect("count");
        assert!(minute_count >= 1);
    }

    #[test]
    fn alert_lifecycle_persists_start_recover_recur() {
        let mut db = MonitorDb::open_in_memory().expect("memory db");
        let alert = MonitorAlert {
            id: "alert-1".into(),
            rule_id: "cpu-high".into(),
            cause_key: "cpu-high".into(),
            state: AlertState::Active,
            severity: AlertSeverity::Warning,
            title: "High CPU".into(),
            summary: "85%".into(),
            evidence: vec!["cpu".into()],
            fired_at_ms: 1000,
            recovered_at_ms: None,
            updated_at_ms: 1000,
        };
        db.upsert_alert(&alert).expect("insert");
        db.insert_alert_event(&AlertEvent {
            kind: AlertEventKind::Fired,
            alert: alert.clone(),
        })
        .expect("event");

        let mut recovered = alert.clone();
        recovered.state = AlertState::Recovered;
        recovered.recovered_at_ms = Some(2000);
        recovered.updated_at_ms = 2000;
        db.upsert_alert(&recovered).expect("recover");
        db.insert_alert_event(&AlertEvent {
            kind: AlertEventKind::Recovered,
            alert: recovered.clone(),
        })
        .expect("event");

        let mut again = recovered.clone();
        again.state = AlertState::Active;
        again.recovered_at_ms = None;
        again.updated_at_ms = 3000;
        again.summary = "90%".into();
        db.upsert_alert(&again).expect("recur");
        db.insert_alert_event(&AlertEvent {
            kind: AlertEventKind::Fired,
            alert: again,
        })
        .expect("event");

        let events: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM alert_events WHERE alert_id = 'alert-1'", [], |row| row.get(0))
            .expect("count");
        assert_eq!(events, 3);
        let loaded = db.load_alerts().expect("load");
        assert_eq!(loaded[0].state, AlertState::Active);
    }

    #[test]
    fn pid_reuse_stored_as_distinct_process_rows() {
        let mut db = MonitorDb::open_in_memory().expect("memory db");
        let at_ms = 5_000u64;
        let sample = MonitorSample {
            at_ms,
            system: SystemSample {
                cpu_percent: Some(1.0),
                memory_pressure: None,
            },
            disk: DiskSample {
                mount_point: "/".into(),
                total_bytes: None,
                available_bytes: None,
            },
            processes: vec![
                ProcessSample {
                    pid: 100,
                    start_time: 1_000,
                    exe_path: Some("/bin/a".into()),
                    name: "node".into(),
                    cpu_percent: Some(1.0),
                    memory_bytes: Some(100),
                },
                ProcessSample {
                    pid: 100,
                    start_time: 2_000,
                    exe_path: Some("/bin/b".into()),
                    name: "node".into(),
                    cpu_percent: Some(2.0),
                    memory_bytes: Some(200),
                },
            ],
        };
        db.insert_sample(None, "raw", &sample).expect("insert");
        let loaded = db.processes_at(at_ms).expect("processes");
        assert_eq!(loaded.len(), 2);
        assert_ne!(loaded[0].start_time, loaded[1].start_time);
    }
}
