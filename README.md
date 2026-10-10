<div align="center">

<img src="src-tauri/icons/128x128@2x.png" width="96" alt="Dev Doctor">

# Dev Doctor

Know what is wrong in a project, free the disk, and see who holds the port — without the project leaving your Mac.

<br>

<img src="https://img.shields.io/badge/macOS-15%2B-007ec6" alt="macOS 15+">
<img src="https://img.shields.io/badge/license-MIT-6f42c1" alt="MIT license">
<img src="https://img.shields.io/badge/Tauri-v2-e6b800" alt="Tauri v2">

<br>

[Documentation](docs/documentation.md) · [Install](#install) · [Contribute](#contribute)

</div>

<img src="docs/screenshots/product-showcase.png" width="100%" alt="Dev Doctor diagnostics window in front of the workspace overview and cleanup screens">

## What it does

Pick a folder and run **Scan Project**. Dev Doctor measures reclaimable folders and checks the toolchain in one pass, then points you at the next step.

| Screen | What you get |
| --- | --- |
| **Overview** | Reclaimable disk, error and warning counts, and one button to open Cleanup or Diagnostics. |
| **Cleanup** | Generated folders such as dependency installs and build output, with sizes. Nothing is deleted until you confirm. |
| **Diagnostics** | Toolchain, lockfiles, environment **names**, and Git. Each row says what is wrong, why, and what to do. |
| **Processes** | Dev servers on this Mac, with listen ports on the row. From Diagnostics, **Find in Processes** jumps to the process that holds a port. |
| **Projects** | Past scans, so you can reopen a folder with the last result. |

## Privacy

Scans stay on your Mac. There is no account and no telemetry. `.env` values are dropped before a snapshot exists and are not shown or saved. History is a JSON file in the app data folder (path is on Settings).

The only commands that run are the ones you confirm, such as `npm install --ignore-scripts` or `pnpm install --ignore-scripts`.

## Install

Download the latest **.dmg** from the [releases](https://github.com/hulk-pham/Dev-Doctor/releases/latest) page, open it, and drag Dev Doctor to Applications.

## How to use

1. Choose a project folder, or pick one from recent scans.
2. Click **Scan Project** and wait for the overview cards.
3. Follow the next step: **Review cleanup** or **Review errors**.
4. On Cleanup, select folders and confirm before anything is removed.
5. On Diagnostics, filter by severity. If you already know a port, use **Find in Processes**.
6. On Processes, pause the list if you need to read a row. Stopping a process asks you to confirm.

## Build from source

macOS, Node.js 20+ and Rust (to build the app), and Xcode Command Line Tools.

```bash
npm install
npm run tauri dev
```

A local `.app` is `npm run tauri build` (under `src-tauri/target/release/bundle/`). How to use each screen: [docs/documentation.md](docs/documentation.md). Tests and signing: [docs/development.md](docs/development.md).

## Contribute

Issues and pull requests are welcome.

- Bug or idea: open a [GitHub issue](https://github.com/hulk-pham/Dev-Doctor/issues) with what you expected and what happened.
- Code change: fork the repo, branch from `main`, and open a pull request.
- Run `npm test` and `npm run typecheck` before you push. Rust changes also need `cargo test --manifest-path src-tauri/Cargo.toml`.
- UI screenshots for the README are rebuilt with `npm run screenshots:showcase` after you replace the PNGs in `docs/screenshots/`.

## License

[MIT](LICENSE).
