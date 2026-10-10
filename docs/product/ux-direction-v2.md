# UX direction v2 (2026-10-10)

Suggestions when the app still feels “correct but not good.” Agents: read with `design-principles.md` before large UI passes.

## Diagnosis

| Symptom | Cause |
| --- | --- |
| Too many boxes | Dashboard = next-step card + 2 cards; Diagnostics = metrics + chips + cards; inspector = 3 sections |
| Lost in space | Hidden `workspaceTab`; only “← Dashboard” wayfinding |
| Duplicate context | Project bar + selector + inspector path |
| Processes feels thin | List-only; detail is another big card; sampling limits trust |
| Inconsistent density | Workspace uses `rounded-2xl shadow-sm`; Projects/Processes use flat lists |

## North star

**Feel:** Xcode / VS Code sidebar + one editor column — not Notion, not Grafana.

**One sentence:** “I opened *this repo*; I see status, one next action, and depth one click away.”

## IA (recommended)

### Workspace — visible sub-nav

Replace hidden tabs with a **segmented control** under the project selector (same row or row below):

`Overview` · `Cleanup` · `Diagnostics`

- No “Review details” on cards if segments exist — cards become **summary tiles** (number + label), whole tile clickable.
- Remove “← Dashboard” back link when segments show active tab.

### Inspector — optional sidecar

- Default **closed** on first launch; remember last state.
- On Processes: default closed.
- Content: **only** fields not already in main column (e.g. last scan time, quick open Projects). Drop duplicate history lists → link “All scans in Projects.”

### Projects

- Keep single list (done). Add **search filter** in toolbar (folder name) if history grows — not intro text.

### Processes

- Toolbar: `Dev | All` · `This project` (filter rows matching current `projectPath`) · Pause · Refresh.
- **Row layout:** primary line `name` + ports right-aligned in mono; secondary PID/CPU/RAM.
- **Detail:** slide-over or expand-in-place row — avoid separate bordered card unless selected.
- Port-by-number: **Diagnostics only** → deep link chip (principle locked in `design-principles.md`).

## Visual system (one pass)

| Token | Current issue | Target |
| --- | --- | --- |
| Page padding | `px-8 py-6` everywhere | Main `px-5 py-4`; align with editor |
| Radius | mix `2xl` / `xl` / `lg` | Lists `rounded-lg`; tiles `rounded-lg`; no `shadow-sm` on tiles |
| Intro copy | cards still have paragraphs | Tiles: **label + metric only**; help in tooltip `?` |
| Status | next-step is a bordered card | **Inline strip** — no border, or left accent bar only |
| Badges | long “1 errors · 0 warnings” | Compact `1E 0W` or dot + number |
| Filters | Diagnostics many chips | One row: severity dropdown + category dropdown (editor-style) |

## Screen sketches (behavior)

### Overview (dashboard)

```text
[ folder ▼ ]                    [ Scan Project ]

Overview | Cleanup | Diagnostics

┌─ Next ─────────────────────────────────────┐
│ 1 error blocks run          [ Review ]     │  ← no outer card; muted bg strip
└────────────────────────────────────────────┘

┌──────────────┐  ┌──────────────┐
│ 899 MB       │  │ 1E · 0W      │            ← click tile → tab
│ Reclaimable  │  │ Diagnostics  │
└──────────────┘  └──────────────┘
```

### Diagnostics

- Drop 3-column metrics (redundant with overview tile).
- Finding list: compact rows; expand for evidence (progressive disclosure).
- Ports section: one line + port input + “Find in Processes” (no paragraph).

### Cleanup

- Sticky footer: `Listed · Selected · [ Remove ]`.
- Groups collapsible (Dependencies open, rest closed).

## Roadmap

### Wave A — Wayfinding (high impact, ~1 session)

1. Workspace segmented control; remove duplicate card CTAs.
2. Next-step → flat strip (no border card).
3. Inspector slim + default closed on Processes.
4. Dedupe project context on Workspace (bar OR selector emphasis, not both heavy).

### Wave B — Density & consistency (~1–2 sessions)

5. Unify radius/shadow; shorten Diagnostics/Cleanup chrome.
6. Finding cards → expandable rows.
7. Processes row typography + “This project” filter.

### Wave C — Trust & power (~backend)

8. Process list from listeners ∪ dev (not top-200 CPU only).
9. Cleanup sticky actions + “Measure now” on stale history.
10. Optional ⌘F find (port/name) as overlay — not toolbar field.

## Out of scope

New features (Docker, schedules), marketing empty states, dark-theme redesign.

## How to pick work

Ask the user: **Wave A only**, **A+B**, or **one screen deep-dive** (usually Workspace first).
