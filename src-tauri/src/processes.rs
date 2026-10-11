use crate::probe::{run_command, CommandError};
use crate::security::redact;
use serde::Serialize;
use std::collections::HashMap;
use std::time::Duration;

pub(crate) const DEV_NAMES: &[&str] = &[
    "node", "npm", "pnpm", "yarn", "bun", "vite", "next", "next-server", "cargo", "rustc", "rust-analyzer", "python", "python3",
    "java", "gradle", "mvn", "go", "docker", "dockerd", "ruby", "php", "composer", "flutter", "dart", "beam.smp",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub pid: u32,
    pub ppid: u32,
    pub cpu_percent: f64,
    pub memory_bytes: u64,
    pub elapsed: String,
    pub name: String,
    pub command: String,
    pub cwd: Option<String>,
    pub tcp_ports: Vec<u16>,
    pub development: bool,
    pub observed_high_cpu: bool,
    pub observed_high_memory: bool,
}

pub fn list_processes(include_all: bool) -> Result<Vec<ProcessInfo>, String> {
    let output = match run_command(
        "ps",
        &["-ax", "-o", "pid=,ppid=,pcpu=,rss=,etime=,ucomm="],
        None,
        Duration::from_secs(8),
    ) {
        Ok(output) if output.success => output.stdout,
        Ok(output) => return Err(redact(&output.stderr)),
        Err(CommandError::NotFound(_)) => return Err("ps was not found on PATH.".into()),
        Err(CommandError::Timeout) => return Err("ps timed out.".into()),
        Err(CommandError::Io(message)) => return Err(message),
    };
    let mut rows: Vec<ProcessInfo> = output.lines().filter_map(parse_ps_line).collect();
    attach_working_directories(&mut rows);
    attach_listen_ports(&mut rows);
    if include_all {
        rows.sort_by(|left, right| right.cpu_percent.partial_cmp(&left.cpu_percent).unwrap_or(std::cmp::Ordering::Equal));
        rows.truncate(200);
    } else {
        rows.retain(|row| row.development || !row.tcp_ports.is_empty());
        rows.sort_by(|left, right| {
            let left_listen = u8::from(!left.tcp_ports.is_empty());
            let right_listen = u8::from(!right.tcp_ports.is_empty());
            right_listen
                .cmp(&left_listen)
                .then_with(|| {
                    right
                        .cpu_percent
                        .partial_cmp(&left.cpu_percent)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
        });
        rows.truncate(250);
    }
    Ok(rows)
}

pub fn terminate_process(pid: u32) -> Result<(), String> {
    let executable = executable_path(pid)?;
    assert_termination_allowed(pid, &executable)?;
    match run_command("kill", &["-TERM", &pid.to_string()], None, Duration::from_secs(5)) {
        Ok(output) if output.success => Ok(()),
        Ok(output) => Err(if output.stderr.trim().is_empty() {
            "The process could not be stopped.".into()
        } else {
            redact(&output.stderr)
        }),
        Err(CommandError::NotFound(_)) => Err("kill was not found on PATH.".into()),
        Err(CommandError::Timeout) => Err("Stopping the process timed out.".into()),
        Err(CommandError::Io(message)) => Err(message),
    }
}

pub fn assert_termination_allowed(pid: u32, executable: &str) -> Result<(), String> {
    if pid == 0 || pid == 1 {
        return Err("PID 0 and PID 1 cannot be stopped.".into());
    }
    let path = executable.trim();
    if path.is_empty() {
        return Err("The executable path could not be confirmed.".into());
    }
    if path.starts_with("/System")
        || path.starts_with("/usr")
        || path.starts_with("/bin")
        || path.starts_with("/sbin")
    {
        return Err("System processes cannot be stopped.".into());
    }
    Ok(())
}

fn executable_path(pid: u32) -> Result<String, String> {
    if let Ok(output) = run_command(
        "lsof",
        &["-a", "-p", &pid.to_string(), "-d", "txt", "-Fn"],
        None,
        Duration::from_secs(5),
    ) {
        if let Some(path) = output
            .stdout
            .lines()
            .find_map(|line| line.strip_prefix('n').map(str::trim).filter(|value| !value.is_empty()))
        {
            return Ok(path.to_string());
        }
    }
    match run_command("ps", &["-p", &pid.to_string(), "-o", "comm="], None, Duration::from_secs(5)) {
        Ok(output) if output.success => {
            let path = output.stdout.trim();
            if path.is_empty() {
                Err("The executable path could not be confirmed.".into())
            } else {
                Ok(path.to_string())
            }
        }
        _ => Err("The executable path could not be confirmed.".into()),
    }
}

fn parse_ps_line(line: &str) -> Option<ProcessInfo> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 6 {
        return None;
    }
    let pid = parts[0].parse().ok()?;
    let ppid = parts[1].parse().ok()?;
    let cpu_percent = parts[2].parse().unwrap_or(0.0);
    let rss_kb: u64 = parts[3].parse().unwrap_or(0);
    let elapsed = parts[4].to_string();
    let name = parts[5].to_string();
    let command = parts[5..].join(" ");
    let memory_bytes = rss_kb.saturating_mul(1024);
    let development = DEV_NAMES.iter().any(|known| name == *known)
        || command.contains("next-server")
        || command.contains("/node_modules/next/");
    Some(ProcessInfo {
        pid,
        ppid,
        cpu_percent,
        memory_bytes,
        elapsed,
        command: clip(&redact(&command), 240),
        name,
        cwd: None,
        tcp_ports: Vec::new(),
        development,
        observed_high_cpu: cpu_percent >= 50.0,
        observed_high_memory: memory_bytes >= 512 * 1024 * 1024,
    })
}

fn attach_working_directories(rows: &mut [ProcessInfo]) {
    let pids: Vec<String> = rows.iter().filter(|row| row.development).take(40).map(|row| row.pid.to_string()).collect();
    if pids.is_empty() {
        return;
    }
    let joined = pids.join(",");
    let Ok(output) = run_command("lsof", &["-nP", "-a", "-d", "cwd", "-Fn", "-p", &joined], None, Duration::from_secs(5)) else {
        return;
    };
    let directories = parse_lsof_cwd(&output.stdout);
    for row in rows.iter_mut() {
        if let Some(cwd) = directories.get(&row.pid) {
            row.cwd = Some(cwd.clone());
        }
    }
}

fn attach_listen_ports(rows: &mut [ProcessInfo]) {
    let Ok(output) = run_command(
        "lsof",
        &["-nP", "-iTCP", "-sTCP:LISTEN", "-Fn"],
        None,
        Duration::from_secs(6),
    ) else {
        return;
    };
    let ports_by_pid = parse_lsof_listen_ports(&output.stdout);
    for row in rows.iter_mut() {
        row.tcp_ports = ports_by_pid.get(&row.pid).cloned().unwrap_or_default();
    }
}

fn parse_lsof_listen_ports(text: &str) -> HashMap<u32, Vec<u16>> {
    let mut current_pid: Option<u32> = None;
    let mut raw: HashMap<u32, Vec<u16>> = HashMap::new();
    for line in text.lines() {
        if let Some(pid_text) = line.strip_prefix('p') {
            current_pid = pid_text.trim().parse().ok();
        } else if let Some(name) = line.strip_prefix('n') {
            let Some(pid) = current_pid else { continue };
            if let Some(port) = port_from_lsof_name(name) {
                raw.entry(pid).or_default().push(port);
            }
        }
    }
    for ports in raw.values_mut() {
        ports.sort_unstable();
        ports.dedup();
    }
    raw
}

fn port_from_lsof_name(name: &str) -> Option<u16> {
    let trimmed = name.trim();
    let (_, port_text) = trimmed.rsplit_once(':')?;
    port_text.parse().ok()
}

fn parse_lsof_cwd(text: &str) -> HashMap<u32, String> {
    let mut current = None;
    let mut directories = HashMap::new();
    for line in text.lines() {
        if let Some(pid) = line.strip_prefix('p') {
            current = pid.parse().ok();
        } else if let Some(path) = line.strip_prefix('n') {
            if let Some(pid) = current {
                if !path.is_empty() {
                    directories.insert(pid, path.to_string());
                }
            }
        }
    }
    directories
}

fn clip(value: &str, max: usize) -> String {
    if value.chars().count() <= max {
        value.to_string()
    } else {
        value.chars().take(max).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_ps_row_and_marks_observed_usage() {
        let row = parse_ps_line("  42  1  55.0  600000 01:02:03 node").unwrap();
        assert_eq!(row.pid, 42);
        assert_eq!(row.ppid, 1);
        assert!(row.development);
        assert!(row.cwd.is_none());
        assert!(row.observed_high_cpu);
        assert!(row.observed_high_memory);
        assert!(row.memory_bytes >= 512 * 1024 * 1024);
    }

    #[test]
    fn reads_lsof_working_directories() {
        let directories = parse_lsof_cwd("p42\nfcwd\nn/Users/hung/app\np7\nn/tmp\n");
        assert_eq!(directories.get(&42).map(String::as_str), Some("/Users/hung/app"));
        assert_eq!(directories.get(&7).map(String::as_str), Some("/tmp"));
    }

    #[test]
    fn reads_tcp_listen_ports_from_lsof() {
        let ports = parse_lsof_listen_ports("p42\nn*:3000\np42\nn127.0.0.1:3001\np7\nn*:5173\n");
        assert_eq!(ports.get(&42).map(Vec::as_slice), Some(&[3000_u16, 3001][..]));
        assert_eq!(ports.get(&7).map(Vec::as_slice), Some(&[5173_u16][..]));
    }

    #[test]
    fn keeps_the_project_path_in_the_command() {
        let row = parse_ps_line("  9  1  1.0  1000 00:10 next-server /Users/hung/web").unwrap();
        assert!(row.development);
        assert!(row.command.contains("/Users/hung/web"));
    }

    #[test]
    fn refuses_system_pids_and_system_paths() {
        assert!(assert_termination_allowed(0, "/Users/me/app").is_err());
        assert!(assert_termination_allowed(1, "/Users/me/app").is_err());
        assert!(assert_termination_allowed(40, "/usr/libexec/trustd").is_err());
        assert!(assert_termination_allowed(40, "/System/Library/CoreServices/loginwindow").is_err());
        assert!(assert_termination_allowed(40, "/bin/zsh").is_err());
        assert!(assert_termination_allowed(40, "").is_err());
        assert!(assert_termination_allowed(40, "/Users/me/node").is_ok());
    }
}
