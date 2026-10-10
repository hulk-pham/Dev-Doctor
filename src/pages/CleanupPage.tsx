import type { ArtifactCategory } from "../diagnostics/artifacts";
import { formatBytes } from "../lib/utils";
import { useAppState } from "../state/AppState";

const GROUPS: ArtifactCategory[] = [
  "dependencies",
  "build-output",
  "cache",
  "test-report",
  "temporary",
  "worktree",
  "branch",
];

const GROUP_LABEL: Record<ArtifactCategory, string> = {
  dependencies: "Dependencies",
  "build-output": "Build output",
  cache: "Caches",
  "test-report": "Test reports",
  temporary: "Temporary",
  worktree: "Worktrees",
  branch: "Branches not checked out",
};

export function CleanupPage() {
  const { artifactFindings, artifactWarnings, artifactError, cleanupListedBytes, scanOrigin, scan } = useAppState();
  const rows = artifactFindings;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Generated folders, caches, worktrees, and branches that are not checked out. This view does not delete anything.
      </p>
      {artifactError ? <p className="text-sm text-danger">{artifactError}</p> : null}
      {artifactWarnings.map((warning) => (
        <p key={warning} className="text-sm text-warning">
          {warning}
        </p>
      ))}
      {cleanupListedBytes != null ? (
        <p className="text-sm">
          Listed size <span className="font-medium">{formatBytes(cleanupListedBytes)}</span>
        </p>
      ) : (
        <p className="text-sm text-muted">
          {scanOrigin === "history" && scan
            ? "This saved scan does not include folder sizes. Run Scan Project to measure them."
            : "Run Scan Project to measure folders."}
        </p>
      )}
      {cleanupListedBytes != null && rows.length === 0 && !artifactError ? (
        <p className="text-sm text-muted">No generated folders, extra worktrees, or unused branches were found.</p>
      ) : null}
      {GROUPS.map((category) => {
        const items = rows.filter((row) => row.category === category);
        if (items.length === 0) return null;
        return (
          <section key={category} className="overflow-hidden rounded-xl border border-border">
            <h2 className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted">
              {GROUP_LABEL[category]}
            </h2>
            <ul>
              {items.map((item) => (
                <li key={item.id} className="border-b border-border px-4 py-3 last:border-b-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-mono text-[13px]">{item.relativePath}</span>
                    <span className="shrink-0 text-sm">{formatBytes(item.bytes)}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {item.technologies.length > 0 ? `${item.technologies.join(", ")} · ` : ""}
                    {item.safety} · {item.reason} {item.consequence}
                    {item.kind === "branch" && item.lastCommitMs
                      ? ` Last commit ${new Date(item.lastCommitMs).toLocaleString()}.`
                      : ""}
                    {item.kind !== "branch" && item.modifiedMs
                      ? ` Modified ${new Date(item.modifiedMs).toLocaleString()}.`
                      : ""}
                    {item.truncated ? " Size measurement stopped early." : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
