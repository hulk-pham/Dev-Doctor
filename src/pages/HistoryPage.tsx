import { formatWhen } from "../lib/utils";
import { useAppState } from "../state/AppState";
import { Badge } from "../components/ui/badge";

export function HistoryPage() {
  const { history, openHistoryEntry, dataDirectory } = useAppState();

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
          {dataDirectory
            ? `Scan summaries are stored locally in ${dataDirectory}.`
            : "Scan summaries are stored in the desktop app's local data folder."}
      </p>
      {history.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-panel px-5 py-10 text-center text-sm text-muted">
          No scans have been saved yet.
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-panel">
          {history.map((entry) => (
            <li key={entry.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => openHistoryEntry(entry)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-panel-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm">{entry.projectName}</span>
                  <span className="block text-xs text-muted">{formatWhen(entry.scannedAt)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge tone={entry.errorCount ? "error" : entry.warningCount ? "warning" : "pass"}>
                    {entry.errorCount} errors · {entry.warningCount} warnings
                  </Badge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
