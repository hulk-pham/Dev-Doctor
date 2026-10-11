# UI kit (single source)

Agents: **`.cursor/rules/ui-kit.mdc`**. Implement with **`src/components/ui/screen-toolbar.tsx`**, **`SegmentedFilter`**, **`FilterMenu`**, **`FilterChip`**, **`Button`**.

## Screen toolbar (every list screen)

One flat row — class **`filterToolbar`** (`gap-1.5`, no gray panel, not `insetBar`).

| Zone | Content | Component |
| --- | --- | --- |
| **Left** | Scope / severity (2–4 mutually exclusive options) | **`SegmentedFilter`** (`Button` sm default vs secondary) |
| **Left+** | On/off filter (This project) and a name/port search | **`Switch`**, text field |
| **Right** (`ToolbarEnd`) | Status time, then icon actions and menus | muted `text-[11px]`, **`ToolbarIconButton`**, **`FilterMenu`** |

**Do not** put Pause / Refresh / Copy as text `Button` sm next to scope — they read as tabs. Use **`ToolbarIconButton`** with `title` + `aria-label`.

## Navigation tabs (workspace sections)

**Underline tabs** only — `WorkspaceSegments` pattern (`border-b-2`, no filled pills). Do not use filled `Button` default for primary nav tabs.

## Scope vs action vs nav

| Pattern | Looks like | Example |
| --- | --- | --- |
| Scope / severity | Segmented `Button` sm pair/group | Dev · All; All · Errors · … |
| On/off filter | `Switch` | This project |
| Toolbar action | `ToolbarIconButton` | Pause, Refresh |
| Primary nav | Underline tab | Overview · Cleanup · Diagnostics |
| Destructive / row action | `Button` sm + label OK | Run fix, Stop |

## Filters with many values

**`FilterMenu`** on **`ToolbarEnd`** (`ml-auto`, `align="end"`). One row total.

## Diagnostic findings

**`findingRowAccent`** + **`Badge`** — never badge color alone.

## Banners

**`insetBar`** only for next-step / measure-now strips — never toolbars.

## Processes (machine) view

One sidebar entry **Processes**. **`MachineSegments`**: underline tabs **Processes · Trends · Alerts** (same pattern as Workspace). One **`ScreenToolbar`** per tab:

- **Processes:** Dev/All **`SegmentedFilter`**, search, list **`ToolbarStatus`** + Pause/Play list refresh + Refresh list.
- **Trends / Alerts:** range or scope filter; **`ToolbarStatus`** = sampler time or “Sampler off”; Pause sampling + Refresh when sampler on.

When sampler off on Trends/Alerts, one **`insetBar`** (Turn on) — not a second toolbar. **Storage degraded:** one **`insetBar`** on Processes (memory-only history). Trends: **`CurrentHealth`** three tiles, then one bordered chart panel. Alerts: **Active · History**; History adds state / time / rule **`SegmentedFilter`**s; one bordered list (chevron, **`Badge`**, `findingRowAccent`).
