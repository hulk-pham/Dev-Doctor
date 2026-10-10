# UX review — full app (2026-10-10)

Living document. Agents: read before IA/navigation/copy changes; move items to **Fixed** when shipped.

## Executive summary

**Strengths:** Local-first, safe cleanup, coherent editor shell, scan loader, diagnostic cards with evidence, Processes improving (ports, pause, dev filter).

**Core problem:** The app is organized by **implementation milestones** (scan, cleanup, diagnostics, processes) more than by **developer intent**. Users repeat context (which project? which history list?) and miss guided “what do I do next?” after a scan.

**Target feel:** One workspace for *the folder I care about now*; one library for *past scans*; one machine view for *ports/processes*—with explicit cross-links, not duplicate forms.

---

## Information architecture

| Nav item | Intended question | Today | Gap |
| --- | --- | --- | --- |
| Workspace | How is **this** project? | Selector + Scan + dashboard tabs | Project not visible on other nav items; empty state cold |
| Projects | What have I scanned? | Two lists (unique paths + all scans) | Overlaps selector recents + inspector history |
| Processes | What is running / on which port? | Dev list, find port, stop | Weak link back to Workspace project |
| Settings | Prefs & trust | Theme, scan-on-select, data dir | Fine; keep minimal |

**Suggested IA**

- **Workspace** = single home; sub-areas via dashboard cards or segmented control (not hidden tabs without label in nav).
- **Projects** = library only; one primary list (grouped by path, expand scans).
- **Processes** = global; filter “Related to current project” optional toggle.
- Drop redundant history from inspector **or** inspector shows only “last scan” + link to Projects.

---

## Screen-by-screen

### App shell

- **Good:** Overlay title bar, nav icons, inspector toggle measured to chrome rules.
- **Change:** Show **current project** under title row or top of main column when `projectPath` set (name + truncate path), even on Processes/Projects.
- **Change:** Inspector default **closed** on Processes (content needs width); remember per-view preference optional later.

### Workspace — selector & scan

- **Good:** Dropdown with recent, sample (dev), choose folder; scan-on-select in Settings.
- **Change:** Primary CTA hierarchy — “Select folder” vs “Scan Project” when none selected (Scan disabled is correct; add one-line why).
- **Change:** After folder pick without scan-on-select, pulse or highlight Scan once.

### Workspace — dashboard

- **Good:** Two cards (Cleanup bytes, Diagnostics counts).
- **Change:** **Next step** strip above cards when `scan` exists:
  - errors > 0 → “Fix blockers” → Diagnostics (focus errors)
  - warnings only → “Review warnings”
  - cleanupListedBytes large → “Review reclaimable space”
  - all clear → “No blocking issues” + last scan time
- **Change:** Show **project name** in dashboard line, not only “Scan complete.”

### Workspace — Cleanup (tab)

- **Good:** Grouped artifacts, delete guardrails, confirm lists consequence, history via AppState.
- **Change:** Sticky summary header: listed total + selected total + Remove (action stays visible on long lists).
- **Change:** From history-only scan without bytes — one button “Measure now” (Scan) inline, not only muted text.
- **Change:** Empty scan — redirect message to dashboard with Scan CTA.

### Workspace — Diagnostics (tab)

- **Good:** Focus/category chips, metrics row, finding cards, fix dialog.
- **Change:** **Remove or demote** manual port form; replace with “Check a port in Processes” link + prefill query param or app state `pendingPort`.
- **Change:** Port **findings from scan** (if any) stay; ad-hoc inspect moves to Processes.
- **Change:** Opening from dashboard “errors” should set `focus=error` via URL state or AppState `diagnosticsFocus` (avoid extra click).

### Projects

- **Good:** Opens history into Workspace.
- **Change:** Merge “Previously scanned” and “All scans” into one UI: group by `projectPath`, nested scans by date; badge per latest.
- **Change:** Subtitle: “Open a project in Workspace—not a separate scan.”

### Processes

- **Good:** tcpPorts on row, dev default, pause, find port, project highlight.
- **Change:** Shorten intro; move sampling note (“top 200 by CPU”) to tooltip or collapsed “About this list”.
- **Change:** Toolbar: `[Scope: Dev | All]` `[Pause]` `[Refresh]` — group visually.
- **Change:** Row action: “Open project” when `project` match (sets Workspace + path from history or cwd).
- **Change (backend):** Build list from **listeners ∪ dev processes** instead of only top CPU 200.

### Settings

- **Good:** Privacy copy, data directory, version.
- **Keep minimal;** add “Open data folder in Finder” when safe (Tauri command) — nice-to-have.

### Inspector (right)

- **Good:** Meta, cleanups, local history for current path.
- **Change:** Hide sections with no data; collapse Cleanups/History into “Activity” with 3 lines max + “See all in Projects”.
- **Change:** When view !== workspace, show compact project chip only (path + “Open workspace”).

---

## Cross-cutting

| Topic | Issue | Suggestion |
| --- | --- | --- |
| State | `workspaceTab` invisible in nav | Segmented control under selector: Overview · Cleanup · Diagnostics |
| History | 4 surfaces | Single source: history JSON; Projects = full UI; elsewhere summaries |
| Copy | Long muted paragraphs | Lead with verb + outcome; one secondary sentence max |
| Errors | `scanError` banner global | Contextual to action; dismiss per session |
| Sample | Removed from UI | Fixture stays for tests only |
| Accessibility | Icon-only nav | `title` exists; expanded menu shows labels—OK |
| Visual | Cards consistent | Processes list is flat; align row padding/radius with Cleanup |

---

## Phased roadmap (suggested)

### Phase 1 — Clarity (small diffs, high impact)

1. Project context bar in shell when path selected.
2. Dashboard next-step line + deep-link Diagnostics focus errors.
3. Processes: tighten copy + toolbar grouping; link “Open project”.
4. Projects: one merged list + clearer subtitle.
5. Diagnostics: port form → link to Processes.

### Phase 2 — Flow

6. Workspace sub-nav tabs visible (Overview / Cleanup / Diagnostics).
7. Inspector slim + deep link to Projects.
8. `diagnosticsFocus` / `pendingPort` in AppState for cross-nav.

### Phase 3 — Data quality

9. Process list: merge listeners + dev tools.
10. Cleanup sticky footer; “Measure now” on stale history.

### Phase 4 — Polish

11. First-run empty Workspace (illustration optional, sample in dev).
12. Finder open for data dir; per-view inspector default.

---

## Fixed

- 2026-10-10: Processes — ports on rows, find port stays on page, dev-only default, pause refresh (see handoff).
- 2026-10-10: **Phase 1** — project context bar; dashboard next-step; Projects merged list; Diagnostics → Processes for port; Processes scope toolbar + Open in Workspace; `openDiagnosticsTab` / `processesPortQuery` in AppState.
- 2026-10-11: **UX v2 waves A–C (local)** — Workspace segments; flat next-step + clickable tiles; inspector slim/default closed; Diagnostics compact rows + selects; Cleanup collapsible + sticky footer + Measure now; Processes expand-in-row, This project, `listProcesses(includeAll)` + dev∪listeners backend; padding `px-5 py-4`.
- 2026-10-11: **Project chrome** — one `ProjectChromeBar` (`h-12`) in shell; removed duplicate Workspace selector row + gray context bar (fixes nav jump).
- 2026-10-11: **Diagnostics filters** — one `filterToolbar` row (severity segment + category menu); rule in design-principles / product-design.
- 2026-10-11: **UI kit** — `docs/product/ui-kit.md` + `ui-kit.mdc` + `screen-toolbar.tsx`; Processes scope = SegmentedFilter, Pause/Refresh = icons.
- 2026-10-11: **Sample project** — removed from selector, Diagnostics banner, Tauri `sample_fixture_path`; fixture for tests/agents only.

---

## Out of scope (unless user asks)

Docker storage, watchdog, scheduled cleanup, new ecosystems, telemetry, cloud sync.
