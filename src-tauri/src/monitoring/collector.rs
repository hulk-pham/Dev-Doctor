use crate::monitoring::alert_manager::{AlertEvent, MonitorAlert};
use crate::monitoring::disk_sampler::{BootVolumeReader, SysinfoDiskReader};
use crate::monitoring::memory_pressure::read_memory_pressure;
use crate::monitoring::metrics::{DiskSample, MonitorSample, SystemSample};
use crate::monitoring::process_sampler::sample_processes;
use crate::monitoring::settings::MonitorSettings;
use crate::monitoring::store::{self, AlertHistoryQuery, MonitorStorage};
use crate::monitoring::watchdog::WatchdogState;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, ProcessRefreshKind, RefreshKind, System};
use tauri::{AppHandle, Emitter};

const RETENTION: Duration = Duration::from_secs(30 * 60);
const COMPACT_EVERY_SAMPLES: usize = 12;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorStatus {
    pub running: bool,
    pub interval_seconds: u64,
    pub sample_count: usize,
    pub last_at_ms: Option<u64>,
    pub storage_degraded: bool,
    pub storage_message: Option<String>,
}

struct Shared {
    ring: VecDeque<MonitorSample>,
    settings: MonitorSettings,
    running: bool,
    last_at_ms: Option<u64>,
    session_id: Option<i64>,
    ticks_since_compact: usize,
    watchdog: WatchdogState,
}

pub struct MonitorHandle {
    shared: Arc<Mutex<Shared>>,
    storage: Arc<Mutex<MonitorStorage>>,
    stop: Arc<AtomicBool>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

impl MonitorHandle {
    pub fn new(storage: Arc<Mutex<MonitorStorage>>) -> Self {
        Self {
            shared: Arc::new(Mutex::new(Shared {
                ring: VecDeque::new(),
                settings: MonitorSettings::default(),
                running: false,
                last_at_ms: None,
                session_id: None,
                ticks_since_compact: 0,
                watchdog: WatchdogState::new(),
            })),
            storage,
            stop: Arc::new(AtomicBool::new(true)),
            thread: Mutex::new(None),
        }
    }

    pub fn hydrate(&self, settings: &MonitorSettings) -> Result<(), String> {
        let mut guard = self.shared.lock().map_err(|_| "Monitor lock poisoned.".to_string())?;
        guard.settings = settings.clone().normalized();
        if let Ok(mut storage) = self.storage.lock() {
            if let Some(alerts) = storage.with_db(|db| db.load_alerts()) {
                guard.watchdog.alerts.replace_all(alerts);
            }
            let at = now_ms();
            let rules = guard.settings.rules.clone();
            storage.with_db(|db| {
                db.sync_rules(&rules, at)?;
                Ok(())
            });
        }
        Ok(())
    }

    pub fn apply_settings(&self, app: &AppHandle, settings: MonitorSettings) -> Result<(), String> {
        let settings = settings.normalized();
        let should_run = settings.enabled;
        {
            let mut guard = self.shared.lock().map_err(|_| "Monitor lock poisoned.".to_string())?;
            guard.settings = settings.clone();
        }
        if let Ok(mut storage) = self.storage.lock() {
            storage.with_db(|db| {
                db.sync_rules(&settings.rules, now_ms())?;
                Ok(())
            });
        }
        if should_run {
            self.start(app, settings)?;
        } else {
            self.stop_async()?;
        }
        Ok(())
    }

    pub fn start(&self, app: &AppHandle, settings: MonitorSettings) -> Result<(), String> {
        let settings = settings.normalized();
        self.stop_and_wait()?;
        self.stop.store(false, Ordering::SeqCst);
        let session_id = self
            .storage
            .lock()
            .ok()
            .and_then(|mut storage| storage.with_db(|db| db.start_session(now_ms())));
        {
            let mut guard = self.shared.lock().map_err(|_| "Monitor lock poisoned.".to_string())?;
            guard.settings = settings.clone();
            guard.running = true;
            guard.session_id = session_id;
            guard.ticks_since_compact = 0;
        }

        let shared = Arc::clone(&self.shared);
        let stop = Arc::clone(&self.stop);
        let storage = Arc::clone(&self.storage);
        let app_handle = app.clone();
        let handle = thread::Builder::new()
            .name("dev-doctor-monitor".into())
            .spawn(move || monitor_loop(shared, stop, storage, app_handle))
            .map_err(|error| format!("Could not start monitor thread: {error}"))?;
        *self.thread.lock().map_err(|_| "Monitor lock poisoned.".to_string())? = Some(handle);
        Ok(())
    }

    pub fn stop_async(&self) -> Result<(), String> {
        self.signal_stop(StopJoin::Background)
    }

    fn stop_and_wait(&self) -> Result<(), String> {
        self.signal_stop(StopJoin::Blocking)
    }

    fn signal_stop(&self, join: StopJoin) -> Result<(), String> {
        self.stop.store(true, Ordering::SeqCst);
        let session_id = self
            .shared
            .lock()
            .map_err(|_| "Monitor lock poisoned.".to_string())?
            .session_id;
        if let Some(session_id) = session_id {
            if let Ok(mut storage) = self.storage.lock() {
                let at = now_ms();
                storage.with_db(|db| {
                    db.end_session(session_id, at)?;
                    Ok(())
                });
            }
        }
        let handle = self
            .thread
            .lock()
            .map_err(|_| "Monitor lock poisoned.".to_string())?
            .take();
        if let Some(handle) = handle {
            match join {
                StopJoin::Blocking => {
                    let _ = handle.join();
                }
                StopJoin::Background => {
                    thread::spawn(move || {
                        let _ = handle.join();
                    });
                }
            }
        }
        let mut guard = self.shared.lock().map_err(|_| "Monitor lock poisoned.".to_string())?;
        guard.running = false;
        guard.session_id = None;
        Ok(())
    }

    pub fn status(&self) -> Result<MonitorStatus, String> {
        let guard = self.shared.lock().map_err(|_| "Monitor lock poisoned.".to_string())?;
        let storage_status = self
            .storage
            .lock()
            .map(|storage| storage.status())
            .unwrap_or_else(|_| store::MonitorStorageStatus {
                available: false,
                degraded: true,
                message: Some("Monitor storage lock failed.".into()),
                sample_count: 0,
                alert_count: 0,
            });
        Ok(MonitorStatus {
            running: guard.running,
            interval_seconds: guard.settings.interval_seconds,
            sample_count: guard.ring.len(),
            last_at_ms: guard.last_at_ms,
            storage_degraded: storage_status.degraded,
            storage_message: storage_status.message,
        })
    }

    pub fn recent(&self, range: &str) -> Result<Vec<MonitorSample>, String> {
        let window_ms = store::parse_range_ms(range)?;
        let until = now_ms();
        let since = until.saturating_sub(window_ms);
        let mut samples: Vec<MonitorSample> = Vec::new();
        if let Ok(mut storage) = self.storage.lock() {
            if let Some(db_samples) = storage.with_db(|db| db.samples_for_range(since, until)) {
                samples = db_samples.into_iter().map(|row| sample_for_ui(&row)).collect();
            }
        }
        let guard = self.shared.lock().map_err(|_| "Monitor lock poisoned.".to_string())?;
        for sample in guard.ring.iter() {
            if sample.at_ms < since {
                continue;
            }
            if samples.iter().any(|row| row.at_ms == sample.at_ms) {
                continue;
            }
            samples.push(sample_for_ui(sample));
        }
        samples.sort_by_key(|sample| sample.at_ms);
        Ok(samples)
    }

    pub fn alerts(&self) -> Result<Vec<MonitorAlert>, String> {
        if let Ok(mut storage) = self.storage.lock() {
            if storage.is_available() {
                if let Some(alerts) = storage.with_db(|db| db.load_alerts()) {
                    return Ok(alerts);
                }
            }
        }
        let guard = self.shared.lock().map_err(|_| "Monitor lock poisoned.".to_string())?;
        Ok(guard.watchdog.alerts.alerts().to_vec())
    }

    pub fn alerts_query(&self, query: AlertHistoryQuery) -> Result<Vec<MonitorAlert>, String> {
        if let Ok(mut storage) = self.storage.lock() {
            if let Some(alerts) = storage.with_db(|db| db.query_alerts(&query)) {
                return Ok(alerts);
            }
        }
        let guard = self.shared.lock().map_err(|_| "Monitor lock poisoned.".to_string())?;
        let mut alerts: Vec<MonitorAlert> = guard.watchdog.alerts.alerts().to_vec();
        if let Some(state) = query.state.filter(|value| value != "all") {
            alerts.retain(|alert| alert_state_matches(alert, &state));
        }
        if let Some(rule_id) = query.rule_id.filter(|value| !value.is_empty()) {
            alerts.retain(|alert| alert.rule_id == rule_id);
        }
        if let Some(since) = query.since_ms {
            alerts.retain(|alert| alert.updated_at_ms >= since);
        }
        if let Some(until) = query.until_ms {
            alerts.retain(|alert| alert.updated_at_ms <= until);
        }
        alerts.sort_by_key(|alert| alert.updated_at_ms);
        alerts.reverse();
        Ok(alerts)
    }

    pub fn dismiss_alert(&self, alert_id: &str) -> Result<Vec<MonitorAlert>, String> {
        let updated = {
            let mut guard = self.shared.lock().map_err(|_| "Monitor lock poisoned.".to_string())?;
            guard
                .watchdog
                .alerts
                .dismiss(alert_id, now_ms())
                .ok_or_else(|| "Alert not found.".to_string())?
        };
        self.persist_alert(&updated, None)?;
        self.alerts()
    }

    pub fn mute_rule(&self, rule_id: &str) -> Result<Vec<MonitorAlert>, String> {
        {
            let mut guard = self.shared.lock().map_err(|_| "Monitor lock poisoned.".to_string())?;
            guard.watchdog.alerts.mute_rule(rule_id);
        }
        self.alerts()
    }

    pub fn clear_history(&self) -> Result<(), String> {
        {
            let mut guard = self.shared.lock().map_err(|_| "Monitor lock poisoned.".to_string())?;
            guard.ring.clear();
            guard.watchdog = WatchdogState::new();
            guard.last_at_ms = None;
        }
        let mut storage = self.storage.lock().map_err(|_| "Monitor storage lock failed.".to_string())?;
        storage.clear_all()?;
        Ok(())
    }

    fn persist_alert(&self, alert: &MonitorAlert, event: Option<&AlertEvent>) -> Result<(), String> {
        if let Ok(mut storage) = self.storage.lock() {
            storage.with_db(|db| {
                db.upsert_alert(alert)?;
                if let Some(event) = event {
                    db.insert_alert_event(event)?;
                }
                Ok(())
            });
        }
        Ok(())
    }
}

fn alert_state_matches(alert: &MonitorAlert, state: &str) -> bool {
    use crate::monitoring::alert_manager::AlertState;
    match state {
        "active" => alert.state == AlertState::Active,
        "recovered" => alert.state == AlertState::Recovered,
        "dismissed" => alert.state == AlertState::Dismissed,
        _ => true,
    }
}

fn parse_range(range: &str) -> Result<Duration, String> {
    let ms = store::parse_range_ms(range)?;
    Ok(Duration::from_millis(ms))
}

fn monitor_loop(shared: Arc<Mutex<Shared>>, stop: Arc<AtomicBool>, storage: Arc<Mutex<MonitorStorage>>, app: AppHandle) {
    let mut sys = System::new_with_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything())
            .with_processes(ProcessRefreshKind::everything()),
    );
    let disk_reader = SysinfoDiskReader;
    while !stop.load(Ordering::SeqCst) {
        let interval = {
            let guard = match shared.lock() {
                Ok(guard) => guard,
                Err(_) => break,
            };
            if !guard.running {
                Duration::from_secs(1)
            } else {
                Duration::from_secs(guard.settings.interval_seconds)
            }
        };

        if shared.lock().map(|guard| !guard.running).unwrap_or(true) {
            thread::sleep(Duration::from_millis(200));
            continue;
        }

        let sample = match collect_sample(&mut sys, &disk_reader, &stop) {
            Some(sample) => sample,
            None => break,
        };
        let ui_sample = sample_for_ui(&sample);
        let _ = app.emit("monitor-sample", &ui_sample);
        let alert_events = if let Ok(mut guard) = shared.lock() {
            push_sample(&mut guard, sample.clone());
            let session_id = guard.session_id;
            let retention = guard.settings.retention_days;
            guard.ticks_since_compact += 1;
            let should_compact = guard.ticks_since_compact >= COMPACT_EVERY_SAMPLES;
            if should_compact {
                guard.ticks_since_compact = 0;
            }
            drop(guard);
            persist_sample(&storage, session_id, retention, should_compact, &sample);
            let mut guard = shared.lock().expect("monitor lock");
            let rules = guard.settings.rules.clone();
            let interval_seconds = guard.settings.interval_seconds;
            match guard.ring.back().cloned() {
                None => Vec::new(),
                Some(latest) => {
                    let ring: Vec<MonitorSample> = guard.ring.iter().cloned().collect();
                    guard.watchdog.on_sample(&app, &rules, &ring, &latest, interval_seconds)
                }
            }
        } else {
            Vec::new()
        };
        for event in alert_events {
            if matches!(event.kind, crate::monitoring::alert_manager::AlertEventKind::Fired) {
                crate::monitoring::notify::show_alert(&app, &event.alert);
            }
            let _ = app.emit("monitor-alert", &event);
            persist_alert_event(&storage, &event);
        }

        if sleep_until_stop(&stop, interval) {
            break;
        }
    }
}

fn persist_sample(
    storage: &Arc<Mutex<MonitorStorage>>,
    session_id: Option<i64>,
    retention_days: u32,
    should_compact: bool,
    sample: &MonitorSample,
) {
    let Ok(mut store) = storage.lock() else {
        return;
    };
    store.with_db(|db| {
        db.insert_sample(session_id, "raw", sample)?;
        if should_compact {
            db.compact(retention_days, sample.at_ms)?;
        }
        Ok(())
    });
}

fn persist_alert_event(storage: &Arc<Mutex<MonitorStorage>>, event: &AlertEvent) {
    let Ok(mut store) = storage.lock() else {
        return;
    };
    store.with_db(|db| {
        db.upsert_alert(&event.alert)?;
        db.insert_alert_event(event)?;
        Ok(())
    });
}

enum StopJoin {
    Blocking,
    Background,
}

fn sleep_until_stop(stop: &AtomicBool, duration: Duration) -> bool {
    let step = Duration::from_millis(100);
    let mut remaining = duration;
    while remaining > Duration::ZERO {
        if stop.load(Ordering::SeqCst) {
            return true;
        }
        let slice = remaining.min(step);
        thread::sleep(slice);
        remaining = remaining.saturating_sub(slice);
    }
    stop.load(Ordering::SeqCst)
}

fn sample_for_ui(sample: &MonitorSample) -> MonitorSample {
    MonitorSample {
        processes: Vec::new(),
        ..sample.clone()
    }
}

fn collect_sample(sys: &mut System, disk_reader: &SysinfoDiskReader, stop: &AtomicBool) -> Option<MonitorSample> {
    if stop.load(Ordering::SeqCst) {
        return None;
    }
    sys.refresh_cpu_all();
    if sleep_until_stop(stop, sysinfo::MINIMUM_CPU_UPDATE_INTERVAL) {
        return None;
    }
    sys.refresh_cpu_all();
    sys.refresh_memory();

    if stop.load(Ordering::SeqCst) {
        return None;
    }
    let cpu = Some(sys.global_cpu_usage());
    let disk: DiskSample = disk_reader.boot_volume();
    let processes = sample_processes(sys);
    Some(MonitorSample {
        at_ms: now_ms(),
        system: SystemSample {
            cpu_percent: cpu,
            memory_pressure: Some(read_memory_pressure()),
        },
        disk,
        processes,
    })
}

fn push_sample(shared: &mut Shared, sample: MonitorSample) {
    shared.last_at_ms = Some(sample.at_ms);
    shared.ring.push_back(sample);
    let cutoff = now_ms().saturating_sub(RETENTION.as_millis() as u64);
    while shared
        .ring
        .front()
        .is_some_and(|entry| entry.at_ms < cutoff)
    {
        shared.ring.pop_front();
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn range_parser_accepts_common_windows() {
        assert_eq!(parse_range("15m").unwrap(), Duration::from_secs(900));
        assert_eq!(parse_range("1h").unwrap(), Duration::from_secs(3600));
    }
}
