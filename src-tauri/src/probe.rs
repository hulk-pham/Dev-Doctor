use crate::security::{redact, resolve_fix, validate_fix_path};
use serde::Serialize;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug)]
pub struct CommandOutput {
    pub success: bool,
    pub status: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug)]
pub enum CommandError {
    NotFound(String),
    Timeout,
    Io(String),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolProbe {
    pub available: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortInspection {
    pub port: u16,
    pub listening: bool,
    pub pid: Option<u32>,
    pub process_name: Option<String>,
    pub listener_count: u32,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixExecutionResult {
    pub ok: bool,
    pub command: String,
    pub exit_code: Option<i32>,
    pub output_tail: String,
    pub error: Option<String>,
}

pub fn run_command(
    program: &str,
    args: &[&str],
    cwd: Option<&Path>,
    timeout: Duration,
) -> Result<CommandOutput, CommandError> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PATH", developer_path());
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }

    let mut child = command.spawn().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            CommandError::NotFound(program.to_string())
        } else {
            CommandError::Io(error.to_string())
        }
    })?;

    let stdout_pipe = child.stdout.take();
    let stderr_pipe = child.stderr.take();
    let stdout_handle = thread::spawn(move || read_pipe(stdout_pipe));
    let stderr_handle = thread::spawn(move || read_pipe(stderr_pipe));
    let started = Instant::now();

    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() > timeout => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_handle.join();
                let _ = stderr_handle.join();
                return Err(CommandError::Timeout);
            }
            Ok(None) => thread::sleep(Duration::from_millis(30)),
            Err(error) => return Err(CommandError::Io(error.to_string())),
        }
    };

    let stdout = stdout_handle.join().unwrap_or_default();
    let stderr = stderr_handle.join().unwrap_or_default();
    Ok(CommandOutput {
        success: status.success(),
        status: status.code(),
        stdout,
        stderr,
    })
}

pub fn probe_version(program: &str) -> ToolProbe {
    match run_command(program, &["--version"], None, Duration::from_secs(8)) {
        Ok(output) if output.success => ToolProbe {
            available: true,
            version: first_line(&output.stdout).or_else(|| first_line(&output.stderr)),
            error: None,
        },
        Ok(output) => ToolProbe {
            available: true,
            version: None,
            error: Some(clip(&format!("{} {}", output.stderr, output.stdout), 240)),
        },
        Err(CommandError::NotFound(name)) => ToolProbe {
            available: false,
            version: None,
            error: Some(format!("{name} was not found on PATH.")),
        },
        Err(CommandError::Timeout) => ToolProbe {
            available: false,
            version: None,
            error: Some(format!("{program} --version timed out.")),
        },
        Err(CommandError::Io(message)) => ToolProbe {
            available: false,
            version: None,
            error: Some(message),
        },
    }
}

pub fn inspect_listen_port(port: u16) -> Result<PortInspection, String> {
    if port == 0 {
        return Err("Enter a port from 1 to 65535.".into());
    }
    let spec = format!("-iTCP:{port}");
    let output = match run_command("lsof", &["-nP", &spec, "-sTCP:LISTEN", "-Fpc"], None, Duration::from_secs(5)) {
        Ok(output) => output,
        Err(CommandError::NotFound(_)) => {
            return Ok(empty_port(port, Some("lsof was not found on PATH.".into())));
        }
        Err(CommandError::Timeout) => {
            return Ok(empty_port(port, Some("The port check timed out.".into())));
        }
        Err(CommandError::Io(message)) => return Ok(empty_port(port, Some(message))),
    };

    if !output.success && output.status != Some(1) && !output.stdout.trim().is_empty() {
        return Ok(empty_port(port, Some(clip(&output.stderr, 240))));
    }

    let listeners = parse_lsof(&output.stdout);
    if listeners.is_empty() {
        return Ok(PortInspection {
            port,
            listening: false,
            pid: None,
            process_name: None,
            listener_count: 0,
            error: None,
        });
    }

    let first = &listeners[0];
    let process_name = process_name(first.pid).or_else(|| first.name.clone());
    Ok(PortInspection {
        port,
        listening: true,
        pid: Some(first.pid),
        process_name,
        listener_count: listeners.len() as u32,
        error: None,
    })
}

pub fn execute_install(action: &str, project_path: &str) -> Result<FixExecutionResult, String> {
    let spec = resolve_fix(action)?;
    if spec.uses_shell {
        return Err("Shell execution is not allowed.".into());
    }
    let cwd = validate_fix_path(project_path)?;
    let command = spec.display.to_string();
    match run_command(spec.program, spec.args, Some(&cwd), spec.timeout) {
        Ok(output) => Ok(FixExecutionResult {
            ok: output.success,
            command,
            exit_code: output.status,
            output_tail: redact(&tail_output(&output.stdout, &output.stderr)),
            error: if output.success {
                None
            } else {
                Some(format!("The command exited with code {}.", output.status.unwrap_or(-1)))
            },
        }),
        Err(CommandError::NotFound(name)) => Ok(failed(command, format!("{name} was not found on PATH."))),
        Err(CommandError::Timeout) => Ok(failed(command, "The command timed out and was stopped.".into())),
        Err(CommandError::Io(message)) => Ok(failed(command, message)),
    }
}

struct Listener {
    pid: u32,
    name: Option<String>,
}

fn parse_lsof(stdout: &str) -> Vec<Listener> {
    let mut listeners = Vec::new();
    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix('p') {
            if let Ok(pid) = rest.trim().parse::<u32>() {
                listeners.push(Listener { pid, name: None });
            }
        } else if let Some(rest) = line.strip_prefix('c') {
            if let Some(listener) = listeners.last_mut() {
                if listener.name.is_none() {
                    let name = rest.trim();
                    if !name.is_empty() {
                        listener.name = Some(name.to_string());
                    }
                }
            }
        }
    }
    listeners
}

fn process_name(pid: u32) -> Option<String> {
    let pid_text = pid.to_string();
    let output = run_command("ps", &["-p", &pid_text, "-o", "comm="], None, Duration::from_secs(3)).ok()?;
    if !output.success {
        return None;
    }
    let text = output.stdout.trim();
    if text.is_empty() {
        return None;
    }
    Path::new(text)
        .file_name()
        .and_then(|name| name.to_str())
        .map(ToString::to_string)
}

fn empty_port(port: u16, error: Option<String>) -> PortInspection {
    PortInspection {
        port,
        listening: false,
        pid: None,
        process_name: None,
        listener_count: 0,
        error,
    }
}

fn failed(command: String, error: String) -> FixExecutionResult {
    FixExecutionResult {
        ok: false,
        command,
        exit_code: None,
        output_tail: String::new(),
        error: Some(error),
    }
}

fn developer_path() -> String {
    let inherited = std::env::var("PATH").unwrap_or_else(|_| "/usr/bin:/bin".to_string());
    format!("/opt/homebrew/bin:/usr/local/bin:{inherited}")
}

fn read_pipe(pipe: Option<impl Read>) -> String {
    let mut pipe = match pipe {
        Some(pipe) => pipe,
        None => return String::new(),
    };
    let mut buffer = Vec::new();
    let _ = pipe.read_to_end(&mut buffer);
    String::from_utf8_lossy(&buffer).to_string()
}

fn first_line(text: &str) -> Option<String> {
    let line = text.lines().find(|line| !line.trim().is_empty())?.trim();
    if line.is_empty() {
        None
    } else {
        Some(clip(line, 80))
    }
}

fn tail_output(stdout: &str, stderr: &str) -> String {
    let mut combined = String::new();
    if !stdout.trim().is_empty() {
        combined.push_str(stdout.trim());
        combined.push('\n');
    }
    if !stderr.trim().is_empty() {
        combined.push_str(stderr.trim());
    }
    let lines: Vec<&str> = combined.lines().collect();
    let start = lines.len().saturating_sub(80);
    clip(&lines[start..].join("\n"), 8000)
}

pub fn clip(input: &str, max: usize) -> String {
    if input.len() <= max {
        return input.to_string();
    }
    let mut end = max.min(input.len());
    while end > 0 && !input.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &input[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runs_an_argv_command_without_a_shell() {
        let output = run_command("/bin/echo", &["hello"], None, Duration::from_secs(3)).unwrap();
        assert!(output.success);
        assert_eq!(output.stdout.trim(), "hello");
    }

    #[test]
    fn reports_a_missing_command() {
        let error = run_command("dev-doctor-missing-bin", &["--version"], None, Duration::from_secs(2)).unwrap_err();
        assert!(matches!(error, CommandError::NotFound(_)));
    }

    #[test]
    fn times_out_and_stops_the_process() {
        let error = run_command("/bin/sleep", &["5"], None, Duration::from_millis(200)).unwrap_err();
        assert!(matches!(error, CommandError::Timeout));
    }

    #[test]
    fn parses_lsof_machine_output() {
        let listeners = parse_lsof("p4242\ncnode\n");
        assert_eq!(listeners.len(), 1);
        assert_eq!(listeners[0].pid, 4242);
        assert_eq!(listeners[0].name.as_deref(), Some("node"));
    }
}
