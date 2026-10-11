//! P1.1 spike — compare sysinfo with `ps` and `df`. Not linked into the app binary.

use std::time::{Duration, Instant};
use sysinfo::{
    CpuRefreshKind, MemoryRefreshKind, ProcessRefreshKind, RefreshKind, System,
};

fn main() {
    let mut sys = System::new_with_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything())
            .with_processes(ProcessRefreshKind::everything()),
    );

    let t0 = Instant::now();
    sys.refresh_cpu_all();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu_all();
    sys.refresh_memory();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let sample_ms = t0.elapsed().as_secs_f64() * 1000.0;

    let global_cpu: f32 = sys.global_cpu_usage();
    let used_mem = sys.used_memory();
    let total_mem = sys.total_memory();

    let mut disks = sysinfo::Disks::new_with_refreshed_list();
    disks.refresh(true);
    let boot = disks
        .iter()
        .find(|d| d.mount_point().to_str() == Some("/"))
        .or_else(|| disks.iter().next());

    println!("=== sysinfo sample (one tick, {:.1} ms) ===", sample_ms);
    println!("global_cpu_percent: {global_cpu:.1}");
    println!(
        "memory_bytes: used={used_mem} total={total_mem} used_pct={:.1}",
        used_mem as f64 / total_mem as f64 * 100.0
    );
    if let Some(d) = boot {
        println!(
            "disk_mount={:?} total={} available={}",
            d.mount_point(),
            d.total_space(),
            d.available_space()
        );
    }

    let self_pid = sysinfo::get_current_pid().expect("current pid");
    if let Some(p) = sys.process(self_pid) {
        println!(
            "self pid={} name={} cpu={:.1} mem={} start={:?} exe={:?}",
            self_pid,
            p.name().to_string_lossy(),
            p.cpu_usage(),
            p.memory(),
            p.start_time(),
            p.exe()
        );
    }

    let mut top: Vec<_> = sys.processes().values().collect();
    top.sort_by(|a, b| b.cpu_usage().partial_cmp(&a.cpu_usage()).unwrap());
    println!("\n=== top 8 processes by sysinfo cpu ===");
    for p in top.into_iter().take(8) {
        println!(
            "pid={} cpu={:.1} rss={} name={} start={}",
            p.pid(),
            p.cpu_usage(),
            p.memory(),
            p.name().to_string_lossy(),
            p.start_time()
        );
    }

    // Cost: full refresh loop (simulates 5 s interval x 6 samples)
    let t_loop = Instant::now();
    for _ in 0..6 {
        sys.refresh_cpu_all();
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        sys.refresh_cpu_all();
        sys.refresh_memory();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    }
    let loop_ms = t_loop.elapsed().as_secs_f64() * 1000.0;
    println!(
        "\n=== cost: 6 CPU-aware samples (~{:.0} ms each incl. MINIMUM_CPU_UPDATE_INTERVAL) total {:.0} ms ===",
        loop_ms / 6.0,
        loop_ms
    );
    let _ = Duration::from_millis(1); // keep import if unused in future edits
}
