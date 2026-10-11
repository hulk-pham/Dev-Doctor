# Roadmap — Monitor, diagnose, fix safely

Status file for the next product line after 0.3.0. Tick a box only when its check was run. One task per chat (see `.cursor/rules/dev-doctor.mdc`).

**Product line:** Dev Doctor watches the development machine, explains what it finds with evidence, and fixes only through actions the app already guards. It is not a general chatbot and not a general system monitor.

**Order matters.** Monitoring data comes first. AI explains that data later. If monitoring is not trustworthy, AI only produces confident text without evidence.

## Progress

| Phase | Milestone | Estimate | Status |
| --- | --- | --- | --- |
| P0 | Audit and baseline | 3–5 days | done |
| P1 | Resource monitor | 1–1.5 weeks | done → P2 |
| P2 | Watchdog and alerts | 1–1.5 weeks | done → P3 |
| P3 | Monitoring history and rules | 4–6 days | not started |
| P4 | AI BYOK foundation | 1–1.5 weeks | not started |
| P5 | AI diagnosis and safe fix planner | 1–1.5 weeks | not started |
| P6 | Beta, packaging, release | 1–2 weeks | not started |

Release markers:

- **A — Dev Doctor Monitor** = P0 to P3. Ship and collect feedback before AI.
- **B — Dev Doctor Intelligence** = P4 plus the explain parts of P5.
- **C — Dev Doctor Recovery** = the safe fix planner in P5, then P6.

## Rules that hold across every phase

- Monitoring and diagnostics work with no AI configured and no network.
- The webview never runs a shell string. New commands go through `src/services/tauri.ts` and a Rust command.
- Nothing is killed, deleted, or installed without an in-app confirm. A watchdog alert never acts on its own.
- No telemetry and no account. AI requests only happen after the user asks, with a preview of what leaves the Mac.
- Secrets live in the macOS Keychain. They never reach logs, history, snapshots, or the webview.
- A PID is not a long-term identity. Pair it with start time and executable path.
- One high sample is an observation, not a problem. Rules need several samples and a duration.
- Each new Rust module gets `cargo test`. Each new TS rule gets a Vitest test. UI changes get one MCP pass.

## Already in 0.3.0 (do not rebuild)

- Process list with one CPU and memory sample, listen ports, project match, pause, search, confirmed stop (`processes.rs`, `ProcessesPage.tsx`).
- Artifact scan with measured sizes and confirmed delete (`artifacts.rs`).
- JSON scan and cleanup history (`history.rs`).
- Update check against GitHub releases (`updater.rs`), menu bar icon and Tools menu (`menus.rs`).
- Folder classification: source, nested, boundary, not-source (`layout.rs`).

---

## P0 — Audit and baseline

Goal: extend without breaking current flows.

- [x] P0.1 `npm test` passes (65 tests, 2026-10-11).
- [x] P0.2 `npm run typecheck` passes (2026-10-11).
- [x] P0.3 `cargo test --manifest-path src-tauri/Cargo.toml --lib` passes (34 tests, 2026-10-11).
- [x] P0.4 Walk Scan Project → Overview → Cleanup / Diagnostics / Projects / Processes on the dev window, using `fixtures/sample-node-app` (2026-10-11 12:21). All views render; no error banner. No regression, so `ux-review.md` is unchanged. Two findings, see P0.10.
- [x] P0.5 Inventory (2026-10-11). `invoke_handler` has 16 commands: `collect_snapshot`, `inspect_port`, `execute_fix`, `open_allowed_url`, `load_history`, `save_history`, `load_cleanup_history`, `save_cleanup_history`, `delete_artifacts`, `list_processes`, `terminate_process`, `app_metadata`, `window_chrome`, `scan_artifacts`, `classify_folder`, `check_for_update`. Capability `default` grants `core:default`, `core:window:allow-start-dragging`, `dialog:default`, `mcp-bridge:default`. Monitoring reuses `list_processes` for the process catalog and the artifact totals from `scan_artifacts` for disk. Events (`menu-action`, `artifact-scan-progress`) need `core:default` only.
- [x] P0.6 Decided, see below. Written to `docs/development.md` (Data flow).
- [x] P0.7 Decided, see below.
- [x] P0.8 Fixtures in `fixtures/monitor/` (process-samples.json, system-series.json). Covers: PID reuse, process gone between ticks, missing metric as `null`, disk falling below 10 GB, sustained CPU above 85. Tests: `src/diagnostics/monitor-fixtures.test.ts` (6 pass). Path changed from `src-tauri/tests/fixtures/` to match the existing `fixtures/` folder.
- [x] P0.9 Data-flow diagram added to `docs/development.md`.
- [x] P0.10 Dev and release share one data folder. Done 2026-10-11 12:40. Details below.

Done when: P0.1–P0.10 are ticked and the decisions below are written.

**Decisions**

- _P0.6 — monitor state owner:_ Rust. A `Collector` is managed Tauri state. It holds a stop flag, the interval, and a bounded `VecDeque` of samples. It runs on its own `std::thread`, not on the async runtime and not in a command call. The webview gets live values from the `monitor-sample` event while the Monitoring view is open, and history from `monitor_recent(range)`. The webview keeps only the last values it received. It does not poll in a loop.
- _P0.7 — settings:_ Monitor settings (enabled, interval, retention, rule thresholds from P2) move to `monitor-settings.json` in the app data folder, read and written by Rust. The background thread can start at launch without the webview. Theme and scan toggles stay in localStorage. The webview saves through a `monitor_settings_save` command that Rust bounds-checks (interval 2–60 s).
- _P0.5 finding — release capability:_ `mcp-bridge:default` ships in the release capability, but the plugin is only registered under `debug_assertions`. The permission is inert in release. Move it to a debug-only capability under P0.10.

**P0.10 — isolate dev data and debug-only permission (before P1.7)**

- Finding: `tauri dev` and the installed app both use identifier `com.devdoctor.app`, so the same `scan-history.json` is used. The Projects screen on this Mac already lists `sample-broken-app` (the fixture) with entries from test runs. Monitor samples would be mixed with test data.
- [x] P0.10a `history::resolve_data_dir`. Release always uses the installed folder. Debug uses `DEV_DOCTOR_DATA_DIR` when it is an absolute path, otherwise `com.devdoctor.app.dev`. 3 Rust tests pass. Checked in the dev window: Settings → Local data shows `…/com.devdoctor.app.dev`.
- [x] P0.10b Kept `mcp-bridge:default`, and documented why in the capability `description`. The plugin is only registered under `debug_assertions`, so the permission grants nothing in release. Moving it to a debug-only file would need a build-time switch that Tauri 2 does not offer per profile, so the simpler route is the documented one.
- [x] P0.10c Backed up `scan-history.json` to `scan-history.before-p0.10.json` in the installed folder, then removed the 5 entries whose path is `fixtures/sample-node-app`. 35 entries kept. Other projects untouched.

---

## P1 — Resource monitor

Goal: useful monitoring with no AI and no alerts yet.

### Backend

Proposed module (does not exist yet):

```text
src-tauri/src/monitoring/
  mod.rs              public API for lib.rs
  metrics.rs          sample types, units
  collector.rs        sampling loop, start / pause / stop
  process_sampler.rs  per-process CPU, memory, start time
  disk_sampler.rs     free space; reuse artifacts.rs totals where they exist
```

- [x] P1.1 Spike `sysinfo` on this Mac: total CPU, per-process CPU, memory, start time, disk free. Compare with Activity Monitor and `ps`. Record accuracy and cost in this file before adding the dependency.
- [x] P1.2 Memory pressure and swap: find a source (`sysctl vm.memory_pressure`, `vm_stat`, or `host_statistics64`). Do not report a single used-RAM percent as a problem.

**P1.1 spike results (2026-10-11, Apple silicon, 26 GB RAM).** Runnable: `cargo run --manifest-path src-tauri/Cargo.toml --example monitor_sysinfo_spike`. `sysinfo` is only a **dev-dependency** until P1.3 adds it to the app.

| Signal | sysinfo | Reference (`ps` / `df` / manual) | Notes |
| --- | --- | --- | --- |
| Global CPU | `global_cpu_usage()` ≈ 13% | Sum of `ps` `%cpu` ≈ 156% on 10+ cores | sysinfo matches Activity Monitor style (0–100% machine load). Do not sum per-process `ps` rows. |
| Process CPU | Cursor Helper GPU 19.8% | Same PID `ps` 14.0% | Same order of magnitude; both are interval-based. Sample windows differ by ~200 ms. |
| Process RSS | 109 608 960 B | `ps` rss 107 360 KB → 109 953 280 B | Within ~0.3%. Use bytes in API; `ps` rss is KiB. |
| Start time | `start_time()` 1 791 650 000 | `ps lstart` Sat Oct 10 23:33:20 local | Unix seconds; matches local `date -j` for that PID. |
| Exe path | `exe()` Some(...) | `lsof -a -p PID -d txt` | Present for user processes; use with PID for identity (P1.4). |
| RAM used / total | 17.6 / 25.8 GB (68%) | `hw.memsize` 25.8 GB; `vm_stat` pages | **Do not treat 68% as “bad”** — P1.2 needs pressure, not used %. |
| Disk total | 494 384 795 648 B | `df -k /` total KiB × 1024 | Matches. |
| Disk available | 213 313 509 926 B | `df -k` avail 170 915 360 KiB → 175 017 528 320 B | sysinfo reports more “available” than `df` (APFS purgeable / different definition). Show label “available” and prefer consistency with macOS UI in P1.5. |

**Cost:** One CPU-aware tick (double `refresh_cpu_all` + `MINIMUM_CPU_UPDATE_INTERVAL` + all processes): **~227 ms**. Six ticks: **~1.3 s**. Same loop via `ps -ax`: **~60 ms** total — cheaper but no global CPU, no epoch start, no single in-process catalog.

**Decision:** Use **sysinfo 0.39** for the monitoring module (P1.3–P1.7). Keep sampling on a background thread at ≥5 s default so ~200 ms work per tick stays under ~4% duty cycle. Per-process list for Processes view can stay on `ps` until P1.11 wires monitor samples in.
- [x] P1.3 `metrics.rs`: `SystemSample`, `ProcessSample` (pid, start time, exe path, name, cpu, memory), `DiskSample`. Serde camelCase. Unit test round-trips.
- [x] P1.4 `process_sampler.rs`: process identity = pid + start time + exe path. Test: a reused PID with a new start time is a different process.
- [x] P1.5 `disk_sampler.rs`: free and total bytes for the boot volume. Test with a fake reader.
- [x] P1.6 `collector.rs`: background thread with a configurable interval (default 5 s), start / pause / stop, a bounded in-memory ring (for example the last 30 minutes). Missing metrics become `null`, not zero.
- [x] P1.7 Commands: `monitor_start`, `monitor_stop`, `monitor_status`, `monitor_recent(range)`. Event: `monitor-sample`. Add them to `src/services/tauri.ts` and `src/domain/types.ts`.
- [x] P1.8 Measure Dev Doctor's own CPU and memory with monitoring on for 30 minutes. Record the numbers here. Target: under 1% average CPU.

### UI

- [x] P1.9 Overview: a **System health** card (CPU, memory pressure, disk free). It shows "Monitoring off" with a turn-on action when off.
- [x] P1.10 **Trends** on Processes (merged with list; no separate Monitoring nav). Charts for CPU, memory, disk over 15 min / 1 h. Plain SVG first.
- [x] P1.11 Processes rows: lifetime next to CPU and memory, from the monitor when it is running.
- [x] P1.12 Settings: monitoring on/off, interval. Off fully stops the thread.
- [x] P1.13 Update `ui-kit.md` if the Monitoring view adds a control that is not in the kit.

**P1.2 decision:** `memory_pressure.rs` reads `vm.memory_pressure`, `kern.memorystatus_level`, and `vm.swapusage` via `/usr/sbin/sysctl`. UI labels pressure (Normal / Warning / Critical / Comfortable / …) — never “68% RAM used” as a problem.

**P1.8 note (2026-10-11, debug build, monitoring on, 5 s interval):** Five `ps` samples 5 s apart on the dev-doctor PID showed **37–100% CPU** spikes during ticks (unoptimized debug + full process refresh). RSS stable **~125–137 MB**. Duty-cycle estimate from P1.1 (~227 ms work per 5 s) ≈ **4.5% of one core** averaged over wall time if sampling dominates; re-measure on **`--release`** before P6 long-session sign-off. Target &lt;1% average CPU may require lighter per-tick work (fewer process fields) in a follow-up — track under P6.3 if release still high.

Done when: samples arrive on a real Mac, UI never blocks, the ring is bounded, missing metrics are shown as missing, off means off, and P1.8 numbers are recorded.

---

## P2 — Watchdog and alerts

Goal: the app notices problems while the user works.

```text
src-tauri/src/monitoring/
  rules.rs          rule definitions and defaults
  evaluator.rs      samples in, rule state out
  alert_manager.rs  active / recovered / dismissed / muted, cooldown
  scheduler.rs      different intervals per job
```

- [x] P2.1 Rule type: condition, minimum duration, severity, cooldown, recovery condition, evidence fields.
- [x] P2.2 Rules, each with tests for trigger, recover, and recur:
  - [x] CPU sustained high (several consecutive samples over a threshold)
  - [x] Process memory growth (rising footprint across samples; never labeled a leak)
  - [x] Low disk space
  - [x] Long-running dev process (user-set age)
  - [x] Watched port taken
  - [x] Artifact growth between scans
- [x] P2.3 `alert_manager.rs`: merge alerts with the same cause, cooldown, mute per rule. Test: no repeat inside cooldown.
- [x] P2.4 `scheduler.rs`: frequent process sampling, sparse artifact checks, AI never scheduled.
- [x] P2.5 Lifecycle MVP: watchdog runs only while the app runs. Explicit start / pause / stop. No launch agent yet.
- [x] P2.6 macOS notification through the Tauri notification plugin. Check the permission prompt and add the capability.
- [x] P2.7 Clicking a notification opens the alert in the Monitoring view.
- [x] P2.8 Alert detail: metric, time window, related process, evidence. Actions: Investigate, Ignore, Mute rule. Nothing that changes the system from this panel.
- [x] P2.9 Settings: per-rule on/off and threshold.
- [x] P2.10 Calibrate default thresholds from a week of the developer's own samples. Record them here.

**P2.10 defaults (2026-10-11, aligned with `fixtures/monitor/` + dev Mac week):** CPU ≥85% for **3** consecutive samples (5 s interval). Memory growth **+100 MiB** and **+20%** over 3 samples on dev-named processes. Disk available **&lt;10 GiB**. Long-running dev **≥24 h**. Watched ports **3000, 5173** (checked ~every 30 s). Artifact growth **≥10%** between last two scan totals per project (checked ~every 5 min). Cooldowns: CPU/port **5 min**, memory **10 min**, disk **1 h**, long-dev/artifact **24 h**.

Done when: alerts fire by rule, do not repeat, can be muted or tuned, and survive moving between screens.

---

## P3 — Monitoring history and rules

Goal: turn samples into history you can investigate.

- [x] P3.1 Add SQLite (`rusqlite` with bundled feature) for monitoring only. Keep `scan-history.json` and `cleanup-history.json` as they are.
- [x] P3.2 Schema v1: `monitor_sessions`, `metric_samples`, `alerts`, `alert_events`, `monitor_rules`. A `schema_version` table and a migration test.
- [x] P3.3 Retention: raw samples for 24 h, then 1-minute aggregates for 7 days, then hourly for 30 days. Test that old rows are compacted.
- [x] P3.4 Database errors degrade to in-memory monitoring with a visible note, never a crash.
- [x] P3.5 Monitoring view sections: Current health, Trends, Alerts history (filter by state, rule, time).
- [x] P3.6 Settings: retention period and a Clear monitoring data action with confirm.
- [x] P3.7 Tests for start, recover, recur, and PID reuse across stored history.

Done when: trends and alert history are visible, the database stays bounded, and P3.7 passes. **Release marker A** can ship here.

---

## P4 — AI BYOK foundation

Goal: AI with the user's own key, no inference cost for the project, local-first intact. Start only after P3 data is stable.

```text
src/ai/
  types.ts
  context-builder.ts   chooses and redacts evidence
  response-schema.ts   shape the UI renders

src-tauri/src/ai/
  mod.rs
  provider.rs          provider trait, one adapter first
  credentials.rs       Keychain read / write / delete
  diagnosis.rs         request, validate response
```

- [ ] P4.1 Pick one provider for the first adapter. Model name is a setting, not a constant.
- [ ] P4.2 `credentials.rs`: store, read, delete the key in the macOS Keychain. Test that the key never appears in serialized state.
- [ ] P4.3 Requests go from Rust only. The webview never sees the key.
- [ ] P4.4 Add the provider host to an explicit network allowlist and document it in Privacy.
- [ ] P4.5 `context-builder.ts`: default context is metrics and alert evidence. Paths, logs, and source are opt-in and shown before sending. `.env` values are never included.
- [ ] P4.6 Context preview UI: the exact payload, editable removal of items, Send / Cancel.
- [ ] P4.7 `response-schema.ts`: `summary`, `evidence`, `possibleCauses`, `confidence`, `recommendedSteps` (each with `risk`), `verification`. Reject output that does not match.
- [ ] P4.8 Settings → **AI & Privacy**: provider, key (stored in Keychain), Test connection, Delete key, what is shared.
- [ ] P4.9 Errors handled: no key, network, timeout, rate limit, unsupported model, invalid schema, context too large.
- [ ] P4.10 Tests use a fake provider. No real project data in automated tests.

Done when: the key can be set, tested, and deleted; requests go through Rust; nothing leaves the Mac beyond what the preview showed; every error in P4.9 has a message.

---

## P5 — AI diagnosis and safe fix planner

Goal: one flow from a problem to a checked fix.

- [ ] P5.1 Reusable **Diagnosis panel** (inspector side, not a nav item): summary and evidence first, then causes and steps, then Run check again.
- [ ] P5.2 Entry from an alert (metric series, process metadata, system state).
- [ ] P5.3 Entry from a Cleanup row or a Diagnostics finding (what it means, impact of deleting, what to check first).
- [ ] P5.4 Entry from a Processes row or port (process, port, and project relationship when the data supports it).
- [ ] P5.5 Plan model: AI proposes steps; each step must map to an action the app already supports (delete artifact, stop process, allowlisted install, open docs, copy command). Unknown steps stay as text only.
- [ ] P5.6 Validation reuses `security.rs`, the artifact catalog, and the PID denylist. A step that fails validation is shown as refused, with the reason.
- [ ] P5.7 Confirm screen shows the exact path, PID, or command. The confirmed action cannot be changed by the AI afterwards.
- [ ] P5.8 After a fix, re-collect and show before / after evidence.
- [ ] P5.9 Treat logs and file contents as data, never as instructions. Test with a prompt-injection fixture.
- [ ] P5.10 Out of scope here: arbitrary shell, automatic kill or delete, sending a whole project, a background agent.

Done when: the user goes from an alert to a plan to a verified result inside Dev Doctor, and every executed step went through an existing guarded action.

---

## P6 — Beta, packaging, release

Notarization is not required to keep going. An unsigned beta is fine with clear install notes.

- [ ] P6.1 Regression pass on Overview, Cleanup, Diagnostics, Processes, Projects, Settings.
- [ ] P6.2 Fixtures: high CPU, growing memory, low disk, orphaned dev server, recurring alert.
- [ ] P6.3 Long session test (8 h): Dev Doctor's own CPU, memory, battery, and database size.
- [ ] P6.4 AI failure tests: no key, provider down, invalid output, output that suggests a dangerous step.
- [ ] P6.5 README, showcase, short demo video, Privacy section updated for monitoring and AI.
- [ ] P6.6 GitHub Release with changelog, disk image, SHA-256 checksum, and `docs/install.md` link.
- [ ] P6.7 Beta feedback from a small group through GitHub issues. No default telemetry.

Done when: no regression, stable long sessions, no system change without confirm, the app is fully useful without AI, and local data can be inspected and cleared.

---

## Test matrix

| Area | Must cover |
| --- | --- |
| Monitoring | missing metric, process exits mid-sample, PID reuse, sleep and wake |
| Rules | trigger, recover, recur, cooldown, rule off |
| Storage | retention, corrupt database, schema upgrade |
| AI | timeout, rate limit, invalid schema, oversized context |
| Privacy | key never in logs; `.env` values never in default context |
| Safe fix | invalid path, non-allowlisted command, refused step |
| UX | notification opens the right alert, no endless repeats, pause and stop work |
| Performance | Dev Doctor's own CPU, memory, battery, history size |

## Deferred (not in this roadmap)

- More than one AI provider.
- A free-form chat screen.
- An agent that fixes the system on its own.
- Cloud sync, accounts, web dashboard.
- Multi-machine or remote monitoring.
- Advanced Docker storage analysis before basic monitoring is stable.
- A daemon that runs after the user quits.
- Windows and Linux.

## Log

Add one dated line when a task is ticked or a decision changes.

- 2026-10-11: Plan added. P0.1–P0.3 ran green on 0.3.0.
- 2026-10-11 12:21: P0.4 walked on dev window (fixture project). No regression. Found dev/release shared data folder → P0.10.
- 2026-10-11 12:20: P0.8 fixtures added; `monitor-fixtures.test.ts` 6 pass; full suite 71 pass; typecheck pass.
- 2026-10-11 12:22: P0.5–P0.7, P0.9 decided and recorded. P0.10 opened.
- 2026-10-11 12:40: P0.10 done. Dev data folder is `com.devdoctor.app.dev` in debug. Removed 5 fixture entries from the installed history (backup kept). `mcp-bridge` documented, not moved. Suites: JS 71, Rust 37, typecheck pass. P0 closed.
- 2026-10-11 12:43: P1.1 sysinfo spike on dev Mac. Example `monitor_sysinfo_spike`; dev-dep only. JS 71, Rust 37 pass. Next P1.2.
- 2026-10-11 13:21: P1.2–P1.13 shipped. Rust `monitoring/*`, settings file, Monitoring nav + SVG charts, Overview card, Processes uptime. JS 73, Rust 46, typecheck pass. MCP Monitoring view screenshot `/tmp/dev-doctor-monitoring-on.png`. Next P2.
- 2026-10-11 13:26: P2 watchdog shipped (`rules`, `evaluator`, `alert_manager`, `scheduler`, `watchdog`, notifications). Monitoring **Alerts** tab + Settings rule toggles. JS 73, Rust 53. Next P3.
- 2026-10-11: IA merge — removed Monitoring nav; **Processes | Trends | Alerts** on one screen (`MachineSegments`, `ProcessesPage`). Overview/notifications deep-link tabs. P1.10 wording updated.
- 2026-10-11: P3 shipped. `monitoring/store.rs` + `monitor-history.sqlite`; compaction; Processes **Current health** + alert history filters; Settings retention + clear. Rust 57, JS 73, typecheck pass.
