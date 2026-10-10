# Safety scenarios

- A directory named `dist` inside `src` is not source. It can be listed as generated when a project file is beside it. A file named `dist.ts` is not a cleanup candidate.
- The artifact folder list lives in `src/diagnostics/artifact-catalog.json`. A folder is not marked safe from its name alone. Generic names such as `bin` are omitted unless a project file confirms them. `.cache`, `tmp`, and `temp` stay uncertain.
- `target` without `Cargo.toml` is uncertain and cannot be deleted.
- `node_modules` is reproducible, not source. Deleting it means a later install.
- Symlinks are not followed outside the project.
- `.git`, `.env`, and home-directory files outside the selected project are rejected.
- Age alone never marks a file for deletion.
- A git worktree is a checkout and may hold source or uncommitted work. It stays uncertain. The scan does not delete it.
- A local branch that is not checked out is listed with its last commit time as context. Age is not a reason to remove it. Branch deletion is not offered.
- A failed size measurement is shown as incomplete. It does not zero out other rows.
- Cleanup deletes only paths that were in the last scan and still match an allowlisted directory name.
- Process termination refuses PID 0, PID 1, and processes whose path is under `/System` or `/usr`.
- Reported reclaimed space is the size measured before delete, after a successful removal.
