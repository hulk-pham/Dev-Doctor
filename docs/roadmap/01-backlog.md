# Feature backlog

Priority is impact for a Node.js developer on one Mac, then safety, then how often the problem shows up.

## Now — MVP

1. Project artifact scanner for one selected folder.
2. Review list grouped by category, with size, time, reason, and safety class.
3. Confirmed cleanup of generated or reproducible directories only, with measured space reclaimed.
4. Process list with CPU, memory, and listening ports.
5. Confirmed termination of a non-system process, with a history entry.

## Next — 0.2

- Docker disk usage, stopped containers, unused images. Volumes stay out of automatic cleanup.
- Tie a process to a project only when the link is reliable.
- Remember artifact and process scans locally.

## Later — 0.3 and 0.4

- Optional background watchdog with thresholds and a quiet default.
- Cleanup rules that stay preview-only until the user turns on deletion.

## Not now — 1.0

- Python, Rust, Go, Java, and Xcode artifact catalogs.
- Payments, accounts, or anything that uploads project data.
