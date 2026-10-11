# Changelog

Versions match the app and the Git tags. The downloadable build is the latest tag on [Releases](https://github.com/hulk-pham/Dev-Doctor/releases).

## 0.4.0 — 2026-10-11

- **Processes** combines the process list with **Trends** (CPU, memory pressure, disk charts) and **Alerts** (watchdog history with filters). Optional background sampling; macOS notifications on new alerts.
- **Monitoring history** in local SQLite (`monitor-history.sqlite`) with retention tiers (raw → minute → hourly). Scan and cleanup history stay JSON.
- **Overview** system health tile; **Settings** for sample interval, watchdog rules, retention days, and clear monitoring data.
- Performance: lighter IPC for live charts; turning sampling off no longer blocks the UI on thread join.
- README reorganized product-first (screenshots and privacy before install). Still unsigned Apple silicon; see [CONTRIBUTING.md](CONTRIBUTING.md).

## 0.3.0 — 2026-10-11

- Menu bar icon, plus Settings and Check for Updates in the app menu. A newer release can be downloaded, reminded later, or skipped.
- Processes: search by name or port, a This project switch, and the clock beside Pause and Refresh.
- A folder of several projects is listed instead of scanned as one project. A folder with no manifest does not get Node.js or npm checks.
- The project row stays on every screen. Toasts dismiss on their own.
- The published build is still unsigned. [CONTRIBUTING.md](CONTRIBUTING.md) asks you to read the source. The [license](LICENSE) says the same thing in plain language, then grants MIT.

## 0.2.0 — 2026-10-11

- Scan a project and measure reclaimable folders together, without locking the window.
- Workspace overview with the next step into Cleanup or Diagnostics.
- Processes list with listen ports, pause, and a confirm step before a process is stopped.

## 0.1.0 — 2026-10-10

- Local diagnostics for a Node.js project folder: toolchain, lockfiles, environment names, and Git.
- Editor-style window chrome. No account and no telemetry.
