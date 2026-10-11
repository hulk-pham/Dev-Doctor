use crate::monitoring::metrics::ProcessSample;
use crate::processes::DEV_NAMES;
use sysinfo::{ProcessesToUpdate, System};

const MAX_DEV_PROCESSES: usize = 250;

/// Used by watchdog rules in P2; identity helpers are tested from P1.4 onward.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[allow(dead_code)]
pub struct ProcessIdentity {
    pub pid: u32,
    pub start_time: u64,
    pub exe_path: Option<String>,
}

#[allow(dead_code)]
pub fn process_identity(pid: u32, start_time: u64, exe_path: Option<String>) -> ProcessIdentity {
    ProcessIdentity {
        pid,
        start_time,
        exe_path,
    }
}

fn is_dev_process(name: &str) -> bool {
    let lower = name.to_lowercase();
    DEV_NAMES.iter().any(|candidate| lower.contains(candidate))
}

/// Dev-named processes only, capped — enough for watchdog rules without scanning the full OS catalog every tick.
pub fn sample_processes(sys: &mut System) -> Vec<ProcessSample> {
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let mut rows: Vec<ProcessSample> = sys
        .processes()
        .iter()
        .filter_map(|(pid, process)| {
            let name = process.name().to_string_lossy();
            if !is_dev_process(&name) {
                return None;
            }
            Some(ProcessSample {
                pid: pid.as_u32(),
                start_time: process.start_time(),
                exe_path: process.exe().map(|path| path.to_string_lossy().into_owned()),
                name: name.into_owned(),
                cpu_percent: Some(process.cpu_usage()),
                memory_bytes: Some(process.memory()),
            })
        })
        .collect();
    rows.sort_by(|left, right| {
        right
            .cpu_percent
            .unwrap_or(0.0)
            .partial_cmp(&left.cpu_percent.unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    rows.truncate(MAX_DEV_PROCESSES);
    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reused_pid_with_new_start_time_is_different_identity() {
        let first = process_identity(100, 1_000, Some("/bin/a".into()));
        let second = process_identity(100, 2_000, Some("/bin/b".into()));
        assert_ne!(first, second);
    }

    #[test]
    fn same_pid_start_and_exe_match() {
        let a = process_identity(100, 1_000, Some("/bin/a".into()));
        let b = process_identity(100, 1_000, Some("/bin/a".into()));
        assert_eq!(a, b);
    }
}
