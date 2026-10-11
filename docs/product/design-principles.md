# Design principles (Dev Doctor)

**Agents:** invariants in `dev-doctor.mdc`; **UI components:** `ui-kit.md` + `ui-kit.mdc`. UX debt: `ux-review.md`. Index: `AGENTS.md`.

Dev Doctor helps a macOS developer **pick a project**, **see what is wrong or heavy**, and **act safely** (clean folders, inspect port/process, run allowlisted fixes). Everything stays local.

## Who we build for

A developer who already knows the repo path and thinks in questions like:

- “Why won't this run?” → diagnostics on **this project**
- “What is eating disk?” → measurable cleanup candidates on **this project**
- “What holds port 3000?” → process + port on **this machine**, tied to known projects when possible

They are busy and skeptical of tools that look like dashboards but hide the next step.

## North-star journeys (optimize these first)

| Intent | Start | Success looks like |
| --- | --- | --- |
| Fix the project | Select folder → Scan | Dashboard shows counts; one obvious next step (errors → Diagnostics, bytes → Cleanup) |
| Free disk | Scan → Cleanup | Totals match measurement; uncertain rows visible but not deletable |
| Stuck port / runaway dev server | Processes (Processes tab) | Port on the row; find port selects process; stop only after confirm |
| Machine health / watchdog | Processes (Trends or Alerts tab) | Overview opens Trends; notifications open Alerts; sampler off is explicit |
| Return later | Projects or inspector history | Same project reopens with last scan context |

## Product rules (non-negotiable)

1. **One primary question per screen.** Workspace = “how is *this* project?” Processes = “how is this Mac — what is running, and are trends/alerts worth acting on?” (three tabs, one nav item). Projects = “what have I scanned before?”
2. **Current project is always obvious** wherever the answer depends on it. If the screen is global (Processes), say so in one line and show project ties on rows.
3. **No silent navigation.** Actions do not change sidebar selection unless the user chose that destination.
4. **Measured, not guessed.** Sizes, ports, and PIDs come from the OS; copy must not imply continuous monitoring or guaranteed completeness.
5. **Safe by default.** Destructive actions are confirm + allowlist; diagnostics stay read-only except explicit fixes.

## Control kit (use these — nothing else in main UI)

| Control | Component / pattern |
| --- | --- |
| **All toolbar / scope / actions / tabs** | **`docs/product/ui-kit.md`** (authoritative) |

Do not duplicate control rules here — update `ui-kit.md` when the kit changes.

## Spacing scale (mandatory)

Use **`src/lib/ui-layout.ts`** for shared class strings. Do not invent new `mb-*` / `space-y-*` per screen.

| Token | Class | Use |
| --- | --- | --- |
| Page stack | `space-y-3` (`stack`) | Between tabs and first block, banner and tiles, list sections |
| Tile grid gap | `gap-3` | Overview two-up cards (match stack) |
| Inset bar | `insetBar` | **Banners only** (next step, Measure now) — never filter toolbars |
| Filter toolbar | `filterToolbar` | Flat row like Processes — `gap-1.5`, no rounded gray panel |
| Summary tile | `summaryTile` | Overview Cleanup/Diagnostics cards — equal `min-h`, footer `mt-auto` |
| Sticky footer | `stickyFooter` | Cleanup actions — `min-h-11`, `py-2.5`, **no negative margin** |
| List row | `px-3 py-2` | Process/cleanup rows |
| Chip/toolbar | `gap-1.5` | Dev / All / Pause |

Rules:

- **One accent pattern** under tabs: tab underline **or** soft banner (`insetBar`), not `border-l-2` plus underline on the tab strip.
- **Finding lists** use **`findingRowAccent`** (left border + row tint) in addition to badges.
- **Tab content** starts with **`pt-3`** under segment nav (same as stack step).
- **Never** `-mx-*` on sticky footers unless full-bleed is an explicit product choice.

## Project chrome (fixed height — no jump)

One row in **`AppShell`**: `ProjectChromeBar` + `ProjectSelector` (`src/components/layout/`).

| Rule | Detail |
| --- | --- |
| Height | **`h-12`** row, **`h-9`** selector + primary action — always `items-center` |
| Same everywhere | Workspace shows Scan; every other view shows Open workspace — **never** a second read-only path bar |
| Visibility | Every view, including Settings, even when no folder is selected |
| Do not | Duplicate selector inside `WorkspacePage`; do not use `flex-wrap` on this row (wrap changes height) |

## UI rules (pairs with `.cursor/rules/ui-chrome.mdc`)

- Editor-like chrome: quiet grays, 13px body, one pixel borders, no decorative dashboard chrome.
- **One primary action** per screen region (e.g. Scan on Workspace, Find port on Processes).
- **Empty states teach the next step** in one sentence + one button—not a paragraph of system behavior.
- **Progressive disclosure:** default view stays short (e.g. dev tools only); “show all” for power users.
- **Hierarchy:** number or status → label → supporting detail (ports, path) → meta (CPU, time).

## Terminology (use consistently)

| Term | Meaning |
| --- | --- |
| Project / folder | The selected path being scanned |
| Scan | Diagnostics + artifact measurement together |
| Cleanup | Review/delete generated or reproducible dirs inside the project |
| Processes | Machine-wide list; rows may **match** a scanned project |
| History | Saved scan snapshots (Projects + inspector), not live state |

## Processes & ports (single model)

**Authoritative doc:** this section. Toolbar layout for Processes is **Dev | All · This project switch · search · time · Pause · Refresh**.

| Intent | Where | Why |
| --- | --- | --- |
| See who listens | **Process rows** (`:3000` on the row + detail) | Primary surface — user scans the list |
| Find a process by name or port | **Search field** on the Processes toolbar | One field matches the process name, command, or listen port |
| “Who has port N?” from a scan | **Diagnostics → Ports** → **Find in Processes** | Fills that same search field and highlights the row |
| Stop a server | Row → detail → Stop | Action stays with the process |

- **Do not** add a second search card beside the list.
- After a deep link, Processes may still show a **one-line chip** (e.g. `Port 3000 · Clear`).
- The clock sits to the left of Pause and Refresh.

Many Node processes are clients, not listeners—omit port text on rows with no listeners.

## Anti-patterns (do not reintroduce)

- Two widgets for the same fact (port result panel + process list).
- Jumping to Workspace/Diagnostics when the user is on Processes.
- Duplicate history UI with different behavior (Projects “All scans” vs inspector without explaining difference).
- Feature-shaped nav (“M3 process inspector”) instead of user-shaped nav (“Processes”).
- Long header copy where a short line + inline hint suffices.

## Definition of done (product)

A change is product-done when:

- A named journey row above still works or the doc is updated.
- Empty, loading, error, and “no permission” states are intentional.
- Copy was read aloud: would a new user know what to click next?
- MCP exercised the **primary control** on the desktop window (not localhost in a browser).

See current gaps in `docs/product/ux-review.md`.
