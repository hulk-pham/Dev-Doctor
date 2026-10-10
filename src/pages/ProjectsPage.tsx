import { Badge } from "../components/ui/badge";
import { formatWhen } from "../lib/utils";
import { useAppState } from "../state/AppState";

export function ProjectsPage() {
  const state = useAppState();
  const seen = new Set<string>();
  const projects = state.history.filter((entry) => {
    if (seen.has(entry.projectPath)) return false;
    seen.add(entry.projectPath);
    return true;
  });

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">Folders scanned on this Mac. Open one to see it in Workspace.</p>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-panel px-5 py-10 text-center">
          <h2 className="text-sm font-medium">No projects yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">Scan a folder from Workspace. The summary stays on this machine.</p>
        </div>
      ) : (
        <section className="rounded-xl border border-border bg-panel">
          <div className="border-b border-border px-4 py-3 text-sm font-medium">Previously scanned</div>
          <ul>
            {projects.map((entry) => (
              <li key={entry.projectPath} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-panel-2"
                  onClick={() => state.openHistoryEntry(entry)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{entry.projectName}</span>
                    <span className="block truncate font-mono text-[11px] text-muted">{entry.projectPath}</span>
                  </span>
                  <span className="text-xs text-muted">{formatWhen(entry.scannedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-border">
        <h2 className="border-b border-border px-4 py-3 text-sm font-medium">All scans</h2>
        {state.history.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">No scans have been saved yet.</p>
        ) : (
          <ul>
            {state.history.map((entry) => (
              <li key={entry.id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => state.openHistoryEntry(entry)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-panel-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{entry.projectName}</span>
                    <span className="block text-xs text-muted">{formatWhen(entry.scannedAt)}</span>
                  </span>
                  <Badge tone={entry.errorCount ? "error" : entry.warningCount ? "warning" : "pass"}>
                    {entry.errorCount} errors · {entry.warningCount} warnings
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
