# Dev Doctor

Local-first macOS diagnostics for Node.js projects. Dev Doctor scans a folder on your machine, explains what is broken in plain English, and applies only the fixes you explicitly confirm.

**Know what is broken. Fix it with confidence.**

Dev Doctor is a desktop app for developers who work with Node.js, TypeScript, npm or pnpm, and Git. It answers three questions: what is wrong, why it is happening, and how to fix it safely. Project contents stay on the machine. There is no telemetry.

## Install and run

Requirements:

- macOS 15 or newer for the tested build path
- Node.js 20 or newer, plus npm
- Rust stable (1.77 or newer; this repo was built with Rust 1.99)
- Xcode Command Line Tools

```bash
npm install
npm run prepare:fixture
npm run tauri dev
```

`npm run prepare:fixture` creates a Git repository inside `fixtures/sample-node-app` and leaves `src/uncommitted.js` uncommitted. That folder is sample data with intentional problems. In the app, use **Scan sample project** on Overview.

To scan your own work, choose a folder or drop it on the window, then use **Scan Project**.

Production bundle:

```bash
npm run tauri build
```

The `.app` and disk image are written under `src-tauri/target/release/bundle/`. A local unsigned build opens after you right-click it and choose Open, or after you remove the quarantine flag. See signing below before you distribute it.

## Tests

```bash
npm test
npm run typecheck
cargo test --manifest-path src-tauri/Cargo.toml
```

`npm test` runs Vitest. It covers version comparison, lockfile detection, environment-name comparison, Git status parsing, malformed manifests, missing files, permission errors, fix confirmation, and path allowlisting. `cargo test` covers the Rust path checks, command allowlist, secret redaction, timeouts, and a real scan of the sample fixture.

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
| Sample project | `fixtures/sample-node-app` |

The webview cannot run a shell. It calls a fixed set of Tauri commands. Install fixes are `npm install --ignore-scripts` or `pnpm install --ignore-scripts`, with the project path as the working directory. Arguments are an array. User text is never interpolated into a shell.

Rules return structured findings. One failed check does not cancel the rest of the scan. If a range or file cannot be judged, the finding says so.

## Supported diagnostics

**Runtime & Tooling.** Node.js, npm, and pnpm presence and versions. `engines.node` is compared with the `semver` package. Unparseable ranges stay uncertain.

**Dependencies.** `package.json`, lockfiles, `node_modules`, and a heuristic check that each direct dependency name has a folder. Optional dependencies are not flagged. Multiple lockfiles are a warning, and Dev Doctor will not choose a package manager for you.

**Project configuration.** `.env.example` or `.env.sample` names are compared with names in `.env`. Values are discarded in Rust before the snapshot is built.

**Git.** Repository detection, branch, and uncommitted changes inside the selected folder. No reset, clean, or checkout.

**Ports & Processes.** You enter a TCP port. `lsof` reports listeners. `ps -o comm=` adds a process name. Processes are never killed.

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
- There is no account, analytics, or network call except the package manager you confirm, which talks to the registry, and the browser page you open.

## macOS signing and notarization

`npm run tauri dev` and a local `tauri build` do not need an Apple Developer certificate. Gatekeeper will block an unsigned app downloaded from the internet.

To distribute a release build outside your own Mac:

1. Enroll in the Apple Developer Program.
2. Create a Developer ID Application certificate.
3. Create an app-specific password and a notary profile with `xcrun notarytool store-credentials`.
4. Build with signing enabled. Tauri reads `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` when you set `bundle > macOS > signingIdentity` and the notarization fields in `src-tauri/tauri.conf.json`.
5. Confirm the ticket with `spctl --assess --type execute` and `stapler validate`.

Hardened runtime is required for notarization. Dev Doctor does not need special entitlements beyond Tauri's defaults for a WebKit webview and local process execution. If you later add a JIT or unsigned library, you must declare that entitlement and justify it to Apple.

Without notarization, users can still run a locally built app by right-clicking it and choosing Open.

## Known limitations

- The tested target is macOS. Path rules reject system locations such as `/usr` and `/System`.
- A double-clicked `.app` has a shorter `PATH` than your shell. The runner also looks in `/opt/homebrew/bin` and `/usr/local/bin`. nvm installs outside those directories may still be missed until you launch from a terminal.
- Yarn and Bun lockfiles are detected. Their installers are not executed.
- Missing dependency folders are a heuristic. They can miss packages that are bundled or provided another way.
- `engines.node` must be a semver range. Other syntax is reported as uncertain.
- Port history is not stored. `lsof` may truncate a command name; the PID comes from `ps` when that works.
- Package installs skip lifecycle scripts, so native addons may still need a full install you run yourself.
- The sample's mixed lockfiles intentionally have no one-click install.

## Roadmap

- Yarn and Bun installs behind the same confirmation flow
- Workspace and monorepo awareness
- `tsconfig` and ESLint checks
- Remembering the last folder across launches
- Windows and Linux path policies
- A signed, notarized release build
