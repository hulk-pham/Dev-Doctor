# Handoff

Updated 2026-10-11. Branch `main`. Release `v0.2.0` includes Processes, workspace UX, and the README showcase.

## Product

Local-first macOS app. Tauri 2 owns the machine. React renders findings. No telemetry. No fabricated measurements.

`Scan Project` runs diagnostics and the artifact walk together, on a background thread. The window stays usable. The loader covers the content under the project row for at least 3 seconds. The project selector stays visible and disabled.

Workspace is two cards: Cleanup and Diagnostics. Sidebar: Workspace, Projects, Processes, Settings at the bottom. No status bar. Version is only on Settings.

Right inspector is full height, gray (`#f3f3f3`) against the white content. Its toggle is on the title row, 12px from the right, same size and `y` as the left menu toggle. The panel has no close button.

## Safety already enforced

- Delete only a real directory inside the selected project whose catalog rule is confirmed and `generated` or `reproducible`.
- Refuse uncertain rows, worktrees, branches, symlinks, `.git`, `src`, `tmp`, and `target` without `Cargo.toml`.
- Confirm dialog lists paths and consequences. Reclaimed bytes are measured before delete.
- Stop a process only after confirm. Refuse PID 0, PID 1, and executables under `/System`, `/usr`, `/bin`, `/sbin`.
- CPU and memory on the process list are one observation, not a problem.
- A process row is highlighted only when its cwd or command matches a scanned project path.

## Where to edit

| Concern | File |
| --- | --- |
| Artifact names and safety | `src/diagnostics/artifact-catalog.json` |
| Classify / what can be deleted | `src/diagnostics/artifacts.ts` |
| Walk, measure, delete | `src-tauri/src/artifacts.rs` |
| Process list and SIGTERM | `src-tauri/src/processes.rs` |
| Match a process to a project | `src/diagnostics/processes.ts` |
| Scan, history, delete state | `src/state/AppState.tsx` |
| Shell, nav, inspector column | `src/components/layout/AppShell.tsx` |
| Project row (fixed `h-12`) | `ProjectChromeBar.tsx`, `ProjectSelector.tsx`, `ui-layout.ts` |
| Workspace cards and loader | `src/pages/WorkspacePage.tsx` |
| Commands | `src-tauri/src/lib.rs` |

Scan history: `scan-history.json`, includes `artifactListedBytes`. Cleanup history: `cleanup-history.json`.

## Local (uncommitted)

- **Processes (M3):** rows show TCP listen ports; toolbar **Dev / All · Pause · Refresh** only (no port search—see `docs/product/design-principles.md`). Port lookup: Diagnostics → Find in Processes → highlight chip on Processes. Project rows highlighted; stop after confirm.
- **Agent rules:** one always-on `dev-doctor.mdc`; detail rules by glob — see `AGENTS.md`.
- **No sample in UI** — `fixtures/sample-node-app` for tests/`cargo test` only.
- **README** — showcase only (`product-showcase.png`). Contributor notes: `docs/development.md`.
- **History (M4):** scan history stores measured folder total; cleanup history stores reclaimed bytes and paths. Workspace dashboard and Cleanup page show recent cleanup entries.
- **Docs/rules:** `docs/handoff.md`, `docs/roadmap/05-milestones.md`, `AGENTS.md`, `.cursor/rules/dev-doctor.mdc`.

## Product docs (for agents)

- `docs/product/design-principles.md` — journeys, terminology, done criteria
- `docs/product/ux-review.md` — prioritized UX debt (2026-10-10 review)
- `.cursor/rules/dev-doctor.mdc` + `product-design.mdc` (on UI paths) — product checklist

## Next (product)

- MCP pass after `tauri dev` (Diagnostics flat toolbar + finding accents).
- Optional: ⌘F find overlay; Cleanup footer offset with inspector width; tune collapsible defaults
- Backlog history: `docs/product/ux-direction-v2.md`, `docs/product/ux-review.md`
- Commit when asked (single commit or split M3 vs M4 is fine).
- Do not start Docker, watchdog, or scheduled cleanup unless the user asks.

## Not started

Docker storage, background watchdog, scheduled cleanup, and ecosystems beyond the catalog. Do not add them unless the user asks.

## Checks

Logic: `npm test` and `cargo test --manifest-path src-tauri/Cargo.toml --lib`. UI: MCP on port 9223, only for the control that changed. Dev app: `npm run tauri dev`.
