# User stories

## Scan artifacts

As a developer, I select a project and scan it so I can see generated folders that use disk space.

Acceptance:

- The scan reads only the selected folder.
- Each row shows path, size, modified time, category, and why it was listed.
- `dist`, `build`, `.next`, `coverage`, and `node_modules` are recognized.
- `target` is treated as Rust output only when `Cargo.toml` is in the parent directory.
- A directory is not listed only because it is old.
- Permission errors are reported and do not hide other results.

## Review cleanup

As a developer, I review candidates before anything is removed.

Acceptance:

- The total size is the sum of the listed directories.
- Generated and reproducible items can be selected.
- Uncertain items cannot be selected for deletion.
- The confirm step lists the paths and the consequence, such as a later reinstall or rebuild.

## Clean up

As a developer, I confirm deletion and see how much space was actually freed.

Acceptance:

- Nothing is deleted before confirm.
- Only an allowlisted directory inside the project can be removed.
- The result reports bytes measured before deletion, not an estimate.
- The action is stored locally.

## Inspect processes

As a developer, I inspect a process and its port before deciding to stop it.

Acceptance:

- The list shows name, PID, CPU, and memory from the system.
- A listening port is tied to a PID when the platform provides it.
- Terminate asks for confirmation and refuses system processes.
