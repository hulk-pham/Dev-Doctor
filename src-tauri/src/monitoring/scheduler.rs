/// Decides when expensive watchdog jobs run inside the monitor loop.
#[derive(Debug, Clone, Default)]
pub struct WatchdogScheduler {
    tick: u64,
}

impl WatchdogScheduler {
    pub fn on_tick(&mut self, interval_seconds: u64) -> WatchdogJobs {
        self.tick = self.tick.saturating_add(1);
        let port_every = (30 / interval_seconds.max(1)).max(1);
        let artifact_every = (300 / interval_seconds.max(1)).max(1);
        WatchdogJobs {
            check_watched_ports: self.tick % port_every == 0,
            check_artifact_growth: self.tick % artifact_every == 0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WatchdogJobs {
    pub check_watched_ports: bool,
    pub check_artifact_growth: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn artifact_checks_are_sparser_than_ports() {
        let mut scheduler = WatchdogScheduler::default();
        let mut port_runs = 0;
        let mut artifact_runs = 0;
        for _ in 0..60 {
            let jobs = scheduler.on_tick(5);
            if jobs.check_watched_ports {
                port_runs += 1;
            }
            if jobs.check_artifact_growth {
                artifact_runs += 1;
            }
        }
        assert!(port_runs > artifact_runs);
        assert!(artifact_runs >= 1);
    }
}
