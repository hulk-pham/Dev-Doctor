# Development

Contributor and operator notes. Product pitch: [README](../README.md). How to use the app: [documentation](documentation.md).

## Showcase screenshots

Capture the running desktop window into `docs/screenshots/`:

- `product-hero.png` — Workspace → Overview
- `cleanup.png` — Cleanup
- `diagnostics.png` — Diagnostics
- `processes.png` — Processes

Then:

```bash
npm run screenshots:showcase
```

That writes `docs/screenshots/product-showcase.png`: a dark lockup. The side windows are cropped to their content, tilted, and faded into a blurred backdrop. Capture those sources in dark mode.

## Tests and fixture

```bash
npm test
npm run typecheck
cargo test --manifest-path src-tauri/Cargo.toml
```

`npm run prepare:fixture` builds a Git repo inside `fixtures/sample-node-app` for Vitest and `cargo test`. That folder is not offered in the app UI.

## Architecture

```text
React UI  ->  typed diagnostic rules (TypeScript)
                 ^
                 | ProjectSnapshot (names, versions, status text)
                 |
           Tauri commands (Rust)
                 |
     allowlisted argv only: node, npm, pnpm, git, lsof, ps, installs
```

| Area | Location |
| --- | --- |
| Screens and shell | `src/pages`, `src/components` |
| Finding model | `src/domain/types.ts` |
| Rules | `src/diagnostics` |
| Tauri client | `src/services/tauri.ts` |
| Path checks and allowlist | `src-tauri/src/security.rs` |
| Process execution | `src-tauri/src/probe.rs` |
| Snapshot collection | `src-tauri/src/snapshot.rs` |
| Local history | `src-tauri/src/history.rs` |
| Test fixture | `fixtures/sample-node-app` |

The webview cannot run a shell. It calls a fixed set of Tauri commands. Install fixes are `npm install --ignore-scripts` or `pnpm install --ignore-scripts`, with the project path as the working directory. Arguments are an array. User text is never interpolated into a shell.

Rules return structured findings. One failed check does not cancel the rest of the scan. If a range or file cannot be judged, the finding says so.

## Supported diagnostics

**Runtime & Tooling.** Node.js, npm, and pnpm presence and versions. `engines.node` is compared with `semver`. Unparseable ranges stay uncertain.

**Dependencies.** `package.json`, lockfiles, `node_modules`, and a heuristic that each direct dependency name has a folder. Optional dependencies are not flagged. Multiple lockfiles are a warning; the app does not pick a package manager.

**Project configuration.** `.env.example` or `.env.sample` names are compared with names in `.env`. Values are discarded in Rust before the snapshot is built.

**Git.** Repository detection, branch, and uncommitted changes inside the selected folder. No reset, clean, or checkout.

**Ports & Processes.** A TCP port is entered on Diagnostics. `lsof` reports listeners. `ps` adds a process name. Stopping a process requires an in-app confirm.

## Data flow

Current (0.4.0):

```text
React pages --invoke--> lib.rs commands --> snapshot.rs, probe.rs, processes.rs, artifacts.rs
     ^                                                   |
     +-------- scan and cleanup history (JSON) <---------+  history.rs
```

Planned (monitor, see `docs/roadmap/06-monitor-diagnose-fix.md`):

```text
monitoring/collector.rs      background thread, interval, pause, bounded ring
        | ProcessSample, SystemSample
        v
monitoring/rules.rs -> evaluator.rs -> alert_manager.rs    (P2)
        |                                  |
        v                                  v
monitoring/store.rs            SQLite monitor-history.sqlite (samples, alerts, compaction)
ai/{credentials,provider,diagnosis}.rs   BYOK OpenAI; Keychain; allowlisted host only
events: monitor-sample, monitor-alert
        |                                  |
        +------ monitor_recent ----------> React Monitoring view and System health card
```

Monitor state is owned by Rust. The webview subscribes to events and asks for history. It never polls raw samples in a loop, and it never runs a command string.

## Safe fixes

| Action | What the app does |
| --- | --- |
| Open docs | Opens an allowlisted HTTPS page |
| Copy command | Copies text. Nothing runs |
| Install | Shows the exact command, directory, and side effects. Runs only after Confirm |

Installs are refused outside user and temporary folders, and for any action other than `npm-install` or `pnpm-install`. Commands time out. `--ignore-scripts` is intentional: package lifecycle scripts are not executed.

## Security and privacy

- Diagnostics are read-only until you confirm a fix.
- `.env` values are not returned, displayed, logged, or written into scan history.
- History is JSON in the app data directory, shown on Settings. Assignments that look like `NAME=value` are redacted again before save.
- The frontend permission set is `core:default` and the folder dialog. It does not include a shell or a general filesystem scope.
- Documentation URLs must match an exact allowlist.
- There is no account or analytics. Network use is the package manager you confirm, documentation pages you open, and **Check for Updates**, which requests the GitHub release only. Project paths and file contents are not uploaded.

## macOS signing and notarization

`npm run tauri dev` and a local `tauri build` do not need an Apple Developer certificate. Gatekeeper blocks an unsigned app downloaded from the internet. A local unsigned build opens after you right-click it and choose Open, or after you remove the quarantine flag.

To distribute a release build:

1. Enroll in the Apple Developer Program.
2. Create a Developer ID Application certificate.
3. Create an app-specific password and a notary profile with `xcrun notarytool store-credentials`.
4. Build with signing enabled. Tauri reads `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` when `bundle > macOS > signingIdentity` and notarization are set in `src-tauri/tauri.conf.json`.
5. Confirm the ticket with `spctl --assess --type execute` and `stapler validate`.

Hardened runtime is required for notarization. Dev Doctor does not need special entitlements beyond Tauri's defaults for a WebKit webview and local process execution.

## Known limitations

- The tested target is macOS. Path rules reject system locations such as `/usr` and `/System`.
- A double-clicked `.app` has a shorter `PATH` than your shell. The runner also looks in `/opt/homebrew/bin` and `/usr/local/bin`. nvm installs outside those directories may still be missed until you launch from a terminal.
- Yarn and Bun lockfiles are detected. Their installers are not executed.
- Missing dependency folders are a heuristic.
- `engines.node` must be a semver range. Other syntax is reported as uncertain.
- `lsof` may truncate a command name; the PID comes from `ps` when that works.
- Package installs skip lifecycle scripts, so native addons may still need a full install you run yourself.

## Roadmap

- Yarn and Bun installs behind the same confirmation flow
- Workspace and monorepo awareness
- `tsconfig` and ESLint checks
- Remembering the last folder across launches
- Windows and Linux path policies
- A signed, notarized release build
