# MVP scope

The first testable release is three workflows on a selected Node.js project. Modules D through G stay out.

| In | Out |
| --- | --- |
| Scan generated folders and caches for web, mobile, backend, and game tools from `src/diagnostics/artifact-catalog.json`, plus other git worktrees and local branches that are not checked out | Whole-disk scan, or caches outside the selected folder |
| Group by category and show bytes, modified time, reason, safety | Deleting because a file is old |
| Preview, select, confirm, then delete only generated or reproducible directories | Deleting `src`, `.git`, `.env`, or anything uncertain |
| List processes, CPU, memory, ports | Killing system or unrelated apps |
| Local history of scans and cleanups | Background monitoring, Docker, scheduled rules |

A name match is not enough to call a file safe to delete. Unknown directories are omitted. Uncertain directories can be shown and cannot be deleted.
