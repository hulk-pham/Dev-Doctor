# Contributing to Dev Doctor

Thank you for looking. The downloadable app is **not signed with an Apple Developer ID** and it is **not notarized**. macOS cannot vouch for it. The way to check Dev Doctor is to read the source and, if you want, build it yourself.

## Verify before you install

A release disk image is a convenience. It is not a trusted signature.

1. Clone this repository. Do not stop at the README.
2. Read the boundaries below. They are short files, and they are the behavior of the app.
3. Run the tests.
4. Build a local `.app` if you would rather run a binary you produced.

| Question | Where to read |
| --- | --- |
| Which folders can be opened, and which URLs can be opened? | `src-tauri/src/security.rs` |
| Which commands can run, and with what arguments? | `src-tauri/src/probe.rs` |
| What is collected from a project, and are `.env` values dropped? | `src-tauri/src/snapshot.rs` |
| Which processes can be stopped? | `src-tauri/src/processes.rs` |
| Which folders can be deleted? | `src-tauri/src/artifacts.rs` and `src/diagnostics/artifact-catalog.json` |
| What the window is allowed to invoke | `src-tauri/capabilities/default.json` and `src/services/tauri.ts` |

Installs that the app can run are only `npm install --ignore-scripts` and `pnpm install --ignore-scripts`, and only after you confirm. Deletes are limited to generated or reproducible directories that a catalog rule has confirmed. The app refuses system paths, PID 0, and PID 1.

**Check for Updates** requests the latest GitHub release. It does not send the project path or file contents. There is no account and no telemetry.

If the source and a binary disagree, trust the source you built. Do not paste secrets, `.env` values, or private paths into an issue.

## Build it yourself

macOS, Node.js 20+, Rust, and Xcode Command Line Tools.

```bash
npm install
npm test
npm run typecheck
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

A local application bundle:

```bash
npm run tauri build
```

The `.app` and disk image are under `src-tauri/target/release/bundle/`. That build is also unsigned unless you add your own Apple credentials. Signing notes are in [docs/development.md](docs/development.md).

## Changes we can take

Issues and pull requests are welcome. Bug reports and feature requests should use the templates in `.github/ISSUE_TEMPLATE/`.

- Branch from `main`.
- Keep one change easy to review.
- Run `npm test` and `npm run typecheck`. If you touch Rust, run `cargo test --manifest-path src-tauri/Cargo.toml`.
- There is no GitHub Actions workflow in this repo. Those commands are the check.
- Do not add telemetry, an account, or a network call that uploads project data.
- Do not expand what a confirmed fix is allowed to run without saying so in the pull request and in `src-tauri/src/security.rs`.
- UI screenshots on the README are rebuilt with `npm run screenshots:showcase`.

## License

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE), the same license as the rest of the repository. The plain-language notice in that file explains why readers are asked to verify an unsigned build. The MIT terms are the legal grant.
