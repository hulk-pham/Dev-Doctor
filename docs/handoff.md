# Handoff

Updated 2026-10-11. Branch `main`. Release **v0.4.0** is the unsigned Apple silicon build (monitoring + SQLite history). Read `CONTRIBUTING.md` to verify from source.

## Product

Local-first macOS app. Tauri 2 owns the machine. React renders findings. No telemetry. No fabricated measurements.

`Scan Project` runs diagnostics and the artifact walk together, on a background thread. The window stays usable. The loader covers the content under the project row for at least 3 seconds. The project selector stays visible and disabled.

Workspace is two cards: Cleanup and Diagnostics, plus a **System health** tile on Overview. Sidebar: Workspace, Projects, **Processes** (process list + trends + alerts), Settings at the bottom. No status bar. Version is only on Settings.

Background **sampling** (optional): Rust collector on an interval (`monitor-settings.json`). Samples and alerts persist in **`monitor-history.sqlite`** (scan/cleanup history stay JSON). Retention: raw 24 h → 1 min buckets 7 d → hourly up to **retention days** (Settings, default 30). If SQLite fails, sampling continues in memory with a banner on Processes/Settings. **Processes** tabs: list, **Trends** (current health + charts), **Alerts** (active + history filters). Watchdog + macOS notifications unchanged.

Right inspector is full height, gray (`#f3f3f3`) against the white content. Its toggle is on the title row, 12px from the right, same size and `y` as the left menu toggle. The panel has no close button.

## Safety already enforced

- Delete only a real directory inside the selected project whose catalog rule is confirmed and `generated` or `reproducible`.
- Refuse uncertain rows, worktrees, branches, symlinks, `.git`, `src`, `tmp`, and `target` without `Cargo.toml`.
- Confirm dialog lists paths and consequences. Reclaimed bytes are measured before delete.
- Stop a process only after confirm. Refuse PID 0, PID 1, and executables under `/System`, `/usr`, `/bin`, `/sbin`.
- CPU and memory on the process list are one observation, not a problem.
- A process row is highlighted only when its cwd or command matches a scanned project path.
- Watchdog alerts never kill, delete, or install on their own.

## Where to edit

| Concern | File |
| --- | --- |
| SQLite store / retention | `src-tauri/src/monitoring/store.rs` |
| Collector + DB writes | `src-tauri/src/monitoring/collector.rs` |
| Machine UI | `src/pages/ProcessesPage.tsx`, `src/pages/machine/panels.tsx` |
| Monitor settings | `src-tauri/src/monitoring/settings.rs`, Settings page |
| IPC | `src/services/tauri.ts` |

Scan history: `scan-history.json`. Monitor: `monitor-settings.json`, `monitor-history.sqlite`.

## Local (uncommitted)

- **P1–P3** monitor + watchdog + SQLite history (roadmap log).
- Processes/Monitoring IA merge, perf fixes — see git diff.

## Next (product)

- **Roadmap:** `docs/roadmap/06-monitor-diagnose-fix.md` — **P3 done** (Release marker A). Next **P4** AI BYOK.

## Not started

P4 onward (AI, fix planner). P6 beta packaging.

## Checks

Logic: `npm test`, `cargo test --lib`, `npm run typecheck`. UI: MCP Processes Trends/Alerts after change. Dev: `npm run tauri dev`.
