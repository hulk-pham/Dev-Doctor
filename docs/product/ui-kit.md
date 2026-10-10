# UI kit (single source)

Agents: **`.cursor/rules/ui-kit.mdc`**. Implement with **`src/components/ui/screen-toolbar.tsx`**, **`SegmentedFilter`**, **`FilterMenu`**, **`FilterChip`**, **`Button`**.

## Screen toolbar (every list screen)

One flat row — class **`filterToolbar`** (`gap-1.5`, no gray panel, not `insetBar`).

| Zone | Content | Component |
| --- | --- | --- |
| **Left** | Scope / severity (2–4 mutually exclusive options) | **`SegmentedFilter`** (`Button` sm default vs secondary) |
| **Left+** | Optional boolean filter (e.g. This project) | **`FilterChip`** — not the same shape as scope |
| **Right** (`ToolbarEnd`) | Icon actions, menus, status time | **`ToolbarIconButton`**, **`FilterMenu`**, muted `text-[11px]` |

**Do not** put Pause / Refresh / Copy as text `Button` sm next to scope — they read as tabs. Use **`ToolbarIconButton`** with `title` + `aria-label`.

## Navigation tabs (workspace sections)

**Underline tabs** only — `WorkspaceSegments` pattern (`border-b-2`, no filled pills). Do not use filled `Button` default for primary nav tabs.

## Scope vs action vs nav

| Pattern | Looks like | Example |
| --- | --- | --- |
| Scope / severity | Segmented `Button` sm pair/group | Dev · All; All · Errors · … |
| Optional filter | `FilterChip` | This project |
| Toolbar action | `ToolbarIconButton` | Pause, Refresh |
| Primary nav | Underline tab | Overview · Cleanup · Diagnostics |
| Destructive / row action | `Button` sm + label OK | Run fix, Stop |

## Filters with many values

**`FilterMenu`** on **`ToolbarEnd`** (`ml-auto`, `align="end"`). One row total.

## Diagnostic findings

**`findingRowAccent`** + **`Badge`** — never badge color alone.

## Banners

**`insetBar`** only for next-step / measure-now strips — never toolbars.
