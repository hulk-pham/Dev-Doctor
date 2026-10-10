import { FolderOpen } from "lucide-react";
import { ProjectDashboard } from "../components/ProjectDashboard";
import { Button } from "../components/ui/button";
import { basename, formatWhen } from "../lib/utils";
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
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Health for the folder you selected.</p>
        <Button variant="secondary" onClick={() => void state.chooseFolder()}>
          <FolderOpen size={15} />
          Select folder
        </Button>
      </div>

      {state.scan ? (
        <>
          {state.scan.meta.isSample ? (
            <p className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
              Sample data. This fixture contains intentional problems so you can try Dev Doctor.
            </p>
          ) : null}
          <ProjectDashboard scan={state.scan} />
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-panel px-5 py-10 text-center">
          <h2 className="text-sm font-medium">{state.projectPath ? basename(state.projectPath) : "No project yet"}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            {state.projectPath
              ? "This folder is selected. Run a scan to see its type, toolchain, and Git status."
              : "Select a local project to see its path, toolchain, and last scan."}
          </p>
          <Button className="mt-4" onClick={() => void state.scanCurrent()} disabled={state.scanning}>
            {state.scanning ? "Scanning…" : "Scan Project"}
          </Button>
        </div>
      )}

      {projects.length > 0 ? (
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
      ) : null}
    </div>
  );
}
