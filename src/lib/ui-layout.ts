/** Shared layout classes — keep vertical rhythm consistent (see design-principles.md). */

/** Fixed project row under app chrome — same on Workspace and other views (prevents layout jump). */
export const projectChromeRow =
  "flex h-12 shrink-0 items-center gap-3 border-b border-border bg-panel px-5";

export const projectSelectorButton =
  "flex h-9 w-full max-w-xl items-center gap-2 rounded-lg border border-border bg-panel-2 px-3 text-left hover:bg-panel disabled:cursor-not-allowed disabled:opacity-60";

/** 12px between major blocks on a screen (tabs → banner → list). */
export const stack = "space-y-3";

/** Inline banner row (next step, measure now): same height and inset as list headers. */
export const insetBar =
  "flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-lg bg-panel-2/70 px-3 py-2.5";

/** Flat toolbar (Processes, Diagnostics) — no inset background; secondary filters on the right via `ml-auto`. */
export const filterToolbar = "flex flex-wrap items-center gap-1.5";

/** Overview summary tiles. */
export const summaryTile =
  "flex min-h-[6.75rem] flex-col rounded-lg border border-border bg-panel px-3 py-2.5 text-left hover:bg-panel-2";

/** Sticky action footer inside main column (no negative margin). */
export const stickyFooter =
  "sticky bottom-0 z-10 mt-3 flex min-h-11 items-center justify-between gap-3 border-t border-border bg-panel py-2.5";
