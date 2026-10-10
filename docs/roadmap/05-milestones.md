# Implementation milestones

Each milestone is usable on its own. Do not start the next one by widening the safety rules.

## M1 — Read-only artifact scan

- Catalog of known directory names and safety classes in TypeScript.
- Rust measures those directories inside one validated project.
- Cleanup view groups them and explains them.
- Other git worktrees and local branches that are not checked out are listed as uncertain.
- The selected folder stays in the top-right of the window.
- The scan shows the current step and a progress bar.
- No delete button.

Status: read-only Cleanup view includes worktrees, unused branches, and scan progress. Deletion is still M2.

## M2 — Confirmed cleanup

- Select generated or reproducible rows.
- Confirm dialog lists paths and consequences.
- Delete only those directories. Record measured bytes and the paths locally.

## M3 — Process inspector

- `ps` and the existing port check, shown in one view.
- Details first. Terminate only after confirm, with the PID denylist from the safety notes.

## M4 — History

- Persist artifact scans and cleanup results beside the existing diagnostic history.
- The dashboard shows the latest measured totals, not a score.

## Done for a milestone

Logic has a unit test that was run. UI was checked on the dev window through the MCP bridge. The summary says what works, what was tested, and what is still out.
