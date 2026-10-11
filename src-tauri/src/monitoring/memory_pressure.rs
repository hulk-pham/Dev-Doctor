use crate::monitoring::metrics::MemoryPressureSample;
use std::process::Command;

/// Reads macOS memory pressure and swap. Returns `None` fields when a value cannot be read.
pub fn read_memory_pressure() -> MemoryPressureSample {
    MemoryPressureSample {
        vm_pressure: sysctl_u32("vm.memory_pressure"),
        status_level: sysctl_u32("kern.memorystatus_level"),
        swap_used_bytes: None,
        swap_total_bytes: None,
    }
    .with_swap(read_swap_bytes())
}

impl MemoryPressureSample {
    fn with_swap(mut self, swap: Option<(u64, u64)>) -> Self {
        if let Some((used, total)) = swap {
            self.swap_used_bytes = Some(used);
            self.swap_total_bytes = Some(total);
        }
        self
    }
}

fn sysctl_u32(name: &str) -> Option<u32> {
    let output = Command::new("/usr/sbin/sysctl")
        .args(["-n", name])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    text.trim().parse().ok()
}

fn read_swap_bytes() -> Option<(u64, u64)> {
    let output = Command::new("/usr/sbin/sysctl")
        .args(["-n", "vm.swapusage"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    parse_swapusage(&text)
}

/// Parses `total = 2048.00M  used = 512.00M  free = 1536.00M`.
fn parse_swapusage(text: &str) -> Option<(u64, u64)> {
    let mut used: Option<u64> = None;
    let mut total: Option<u64> = None;
    let mut tokens = text.split_whitespace();
    while let Some(token) = tokens.next() {
        match token {
            "used" if used.is_none() => {
                if tokens.next()? != "=" {
                    return None;
                }
                used = parse_size_token(tokens.next()?);
            }
            "total" if total.is_none() => {
                if tokens.next()? != "=" {
                    return None;
                }
                total = parse_size_token(tokens.next()?);
            }
            _ => {}
        }
    }
    match (used, total) {
        (Some(u), Some(t)) => Some((u, t)),
        _ => None,
    }
}

fn parse_size_token(raw: &str) -> Option<u64> {
    let trimmed = raw.trim_end_matches(',');
    if trimmed.ends_with('M') {
        let value: f64 = trimmed.trim_end_matches('M').parse().ok()?;
        return Some((value * 1024.0 * 1024.0) as u64);
    }
    if trimmed.ends_with('G') {
        let value: f64 = trimmed.trim_end_matches('G').parse().ok()?;
        return Some((value * 1024.0 * 1024.0 * 1024.0) as u64);
    }
    trimmed.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_swapusage_line() {
        let sample = parse_swapusage("total = 2048.00M  used = 512.00M  free = 1536.00M  (encrypted)").expect("parse");
        assert_eq!(sample, (512 * 1024 * 1024, 2048 * 1024 * 1024));
    }

    #[test]
    fn sysctl_reads_on_macos_when_available() {
        if std::env::consts::OS != "macos" {
            return;
        }
        let sample = read_memory_pressure();
        assert!(sample.status_level.is_some() || sample.vm_pressure.is_some());
    }
}
