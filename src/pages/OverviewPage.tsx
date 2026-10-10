import { FolderOpen, ScanSearch } from "lucide-react";
import { formatWhen } from "../lib/utils";
import { useAppState } from "../state/AppState";
import { Button } from "../components/ui/button";

export function OverviewPage() {
  const state = useAppState();
  const summary = state.scan?.summary;
  const recent = state.history.slice(0, 5);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Dev Doctor</h1>
        <p className="mt-1 text-sm text-muted">Know what is broken. Fix it with confidence.</p>
      </div>

      <section
        className="border border-dashed border-border px-5 py-6"
      >
        <ScanSearch className="mx-auto text-muted" size={22} />
        <h2 className="mt-3 text-sm font-medium">
          {state.projectPath ? "Ready to scan this project" : "No project selected"}
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          {state.projectPath
            ? state.projectPath
            : "Choose a local Node.js folder, or drop one on this window. Diagnostics stay on this machine."}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => void state.scanCurrent()} disabled={state.scanning}>
            <ScanSearch size={15} />
            {state.scanning ? "Scanning…" : "Scan Project"}
          </Button>
          <Button variant="secondary" onClick={() => void state.chooseFolder()}>
            <FolderOpen size={15} />
            Select folder
          </Button>
          {state.samplePath ? (
            <Button variant="ghost" onClick={() => void state.openSample()}>
              Scan sample project
            </Button>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Checks passed" value={summary ? String(summary.passed) : "—"} tone="text-success" />
        <Stat label="Warnings" value={summary ? String(summary.warnings) : "—"} tone="text-warning" />
        <Stat label="Errors" value={summary ? String(summary.errors) : "—"} tone="text-danger" />
      </section>

      <section className="rounded-xl border border-border bg-panel">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">Recent scans</div>
        {recent.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">Scan a project to build local history. Nothing is uploaded.</p>
        ) : (
          <ul>
            {recent.map((entry) => (
              <li key={entry.id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => state.openHistoryEntry(entry)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-panel-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{entry.projectName}</span>
                    <span className="block truncate font-mono text-[11px] text-muted">{entry.projectPath}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted">
                    <span className="block">{formatWhen(entry.scannedAt)}</span>
                    <span>
                      {entry.errorCount} errors · {entry.warningCount} warnings
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
