import { useMemo } from "react";
import { Badge } from "../components/ui/badge";
import { formatWhen } from "../lib/utils";
import type { ScanHistoryEntry } from "../domain/types";
import { useAppState } from "../state/AppState";

interface ProjectGroup {
  projectPath: string;
  projectName: string;
  scans: ScanHistoryEntry[];
}

export function ProjectsPage() {
  const state = useAppState();

  const groups = useMemo(() => {
    const map = new Map<string, ProjectGroup>();
    for (const entry of state.history) {
      const existing = map.get(entry.projectPath);
      if (existing) {
        existing.scans.push(entry);
      } else {
        map.set(entry.projectPath, {
          projectPath: entry.projectPath,
          projectName: entry.projectName,
          scans: [entry],
        });
      }
    }
    return [...map.values()];
  }, [state.history]);

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-5 py-10 text-center">
        <p className="text-[13px] font-medium">No scans saved yet</p>
        <p className="mt-1 text-[11px] text-muted">Scan a folder from Workspace.</p>
      </div>
    );
  }

  return (
    <ul className="overflow-hidden rounded-lg border border-border">
      {groups.map((group) => {
        const latest = group.scans[0];
        return (
          <li key={group.projectPath} className="border-b border-border last:border-b-0">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-panel-2"
              onClick={() => state.openHistoryEntry(latest)}
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="truncate text-[13px] font-medium">{group.projectName}</span>
                  <span className="text-[11px] tabular-nums text-muted">{formatWhen(latest.scannedAt)}</span>
                </span>
                <span className="block truncate font-mono text-[11px] text-muted">{group.projectPath}</span>
              </span>
              <Badge tone={latest.errorCount ? "error" : latest.warningCount ? "warning" : "pass"}>
                {latest.errorCount}E · {latest.warningCount}W
              </Badge>
            </button>
            {group.scans.length > 1 ? (
              <ul className="pb-1">
                {group.scans.slice(1, 6).map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 py-1.5 pl-8 pr-4 text-left hover:bg-panel-2"
                      onClick={() => state.openHistoryEntry(entry)}
                    >
                      <span className="text-[11px] text-muted">{formatWhen(entry.scannedAt)}</span>
                      <Badge tone={entry.errorCount ? "error" : entry.warningCount ? "warning" : "pass"}>
                        {entry.errorCount}E · {entry.warningCount}W
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
