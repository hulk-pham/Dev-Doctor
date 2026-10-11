<div align="center">

<img src="src-tauri/icons/128x128@2x.png" width="96" alt="Dev Doctor">

# Dev Doctor

**A local-first macOS toolkit for developers to diagnose projects, reclaim disk space, and find processes holding ports.**

<br>

<img src="https://img.shields.io/badge/macOS-15%2B-007ec6" alt="macOS 15+">
<img src="https://img.shields.io/badge/license-MIT-6f42c1" alt="MIT license">
<img src="https://img.shields.io/badge/Tauri-v2-e6b800" alt="Tauri v2">

</div>

<img src="docs/screenshots/product-showcase.png" width="100%" alt="Dev Doctor diagnostics window in front of the workspace overview and cleanup screens">

Scan your projects, identify cleanup opportunities, diagnose common environment issues, and inspect local development processes — all on your Mac.

- 🔍 **Project diagnostics** — Find common toolchain, Git, and environment issues.
- 🧹 **Safe cleanup** — Review reclaimable disk space before deleting generated files.
- 🔌 **Port and process inspector** — Find which processes are using your development ports.
- 🔒 **Privacy-first** — No account, no telemetry, and no project data sent to a server.

[Download for macOS](https://github.com/hulk-pham/Dev-Doctor/releases/latest) · [Report a bug](https://github.com/hulk-pham/Dev-Doctor/issues/new?template=bug_report.yml) · [Contribute](#contribute)

## Download

The current release is **0.3.0** for Apple silicon.

1. Download [Dev Doctor_0.3.0_aarch64.dmg](https://github.com/hulk-pham/Dev-Doctor/releases/latest) (or a later disk image on that page).
2. Open the disk image and drag Dev Doctor to Applications.
3. The build has no Apple Developer ID and is not notarized. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the source if you want to verify it. The first launch: right-click the app and choose **Open**.

If Gatekeeper still blocks it, see [Install troubleshooting](docs/install.md). What changed in each release: [Changelog](CHANGELOG.md).

## Get started

1. Open Dev Doctor and select a project folder.
2. Click **Scan Project**.
3. On Overview, follow the next step into Cleanup or Diagnostics.
4. Confirm any cleanup or process stop before it runs.

You can also drop a folder on the window. Recent folders are in the project menu and under **Projects**. Screen-by-screen detail: [documentation](docs/documentation.md).

| Screen | What you get |
| --- | --- |
| **Overview** | Reclaimable disk, error and warning counts, and one next step. |
| **Cleanup** | Generated folders with sizes. Nothing is deleted until you confirm. |
| **Diagnostics** | Toolchain, lockfiles, environment names, and Git. Each row says what is wrong and what to do. |
| **Processes** | Dev servers on this Mac, with listen ports. Search by process name or port. |
| **Projects** | Past scans, so you can reopen a folder with the last result. |

## Why Dev Doctor?

Development environments accumulate build artifacts, dependency folders, stale processes, and configuration problems. Dev Doctor brings those checks into one native app on your Mac.

A folder that contains several projects is not scanned as one project. Open one of the projects it lists. A folder with no manifest does not get Node.js or npm checks.

## Privacy

Scans stay on your Mac. There is no account and no telemetry. `.env` values are dropped before a snapshot exists and are not shown or saved. History is a JSON file in the app data folder (the path is on Settings).

**Check for Updates** asks GitHub for the latest release tag and notes. It does not send the project path or file contents. The only commands that change a project are the ones you confirm, such as `npm install --ignore-scripts` or `pnpm install --ignore-scripts`.

## Build from source

macOS, Node.js 20+, Rust, and Xcode Command Line Tools.

```bash
npm install
npm run tauri dev
```

A local `.app` is `npm run tauri build` (under `src-tauri/target/release/bundle/`). Tests and signing: [docs/development.md](docs/development.md).

## Contribute

Issues and pull requests are welcome.

- Bug or idea: open a [bug report](https://github.com/hulk-pham/Dev-Doctor/issues/new?template=bug_report.yml) or [feature request](https://github.com/hulk-pham/Dev-Doctor/issues/new?template=feature_request.yml).
- How to read the source and build a copy yourself: [CONTRIBUTING.md](CONTRIBUTING.md).
- Code change: fork the repo, branch from `main`, and open a pull request.
- Run `npm test` and `npm run typecheck` before you push. Rust changes also need `cargo test --manifest-path src-tauri/Cargo.toml`.
- There is no GitHub Actions workflow in this repo yet. Those commands are the check.
- UI screenshots for this page are rebuilt with `npm run screenshots:showcase`.

## License

[MIT](LICENSE), with a plain-language notice in front of the legal text.

The notice is there because the release build has no Apple Developer ID and is not notarized. It asks you to read the source, names the files that limit deletes and commands, and restates that there is no warranty. It does not add restrictions. The MIT terms are the grant: you may use, copy, modify, and distribute the software, including the copyright notice. The authors are not liable for what the software does.
