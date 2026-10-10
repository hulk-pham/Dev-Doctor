import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, FolderOpen, HardDrive, Stethoscope, Zap } from "lucide-react";
import { CleanupPage } from "./CleanupPage";
import { DiagnosticsPage } from "./DiagnosticsPage";
import { Button } from "../components/ui/button";
import { basename, cn, formatBytes, formatWhen } from "../lib/utils";
import { useAppState } from "../state/AppState";

const PHASE_LABEL: Record<string, string> = {
  environment: "Checking the toolchain",
  discovering: "Looking through folders",
  measuring: "Measuring sizes",
  worktrees: "Reading worktrees",
  branches: "Reading local branches",
};

export function WorkspacePage() {
  const state = useAppState();
  const hasResult = Boolean(state.scan) || state.cleanupListedBytes != null;

  return (
    <div className="space-y-4">
        <div className={cn("flex flex-wrap items-center gap-3", state.scanning && "pointer-events-none opacity-60")}>
          <ProjectSelector disabled={state.scanning} />
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={() => void state.scanCurrent()} disabled={state.scanning || !state.projectPath}>
              <Zap size={15} />
              {state.scanning ? "Scanning…" : "Scan Project"}
            </Button>
          </div>
        </div>

        <div className="relative min-h-[calc(100vh-12rem)]">
        {state.scanning ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-panel">
            <ScanAnimation />
          </div>
        ) : null}

        {!state.scanning && state.workspaceTab !== "dashboard" ? (
          <button
            type="button"
            onClick={() => state.setWorkspaceTab("dashboard")}
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
          >
            <ArrowLeft size={14} />
            Dashboard
          </button>
        ) : null}

        {!state.scanning && state.workspaceTab === "dashboard" ? (
          hasResult || state.projectPath ? (
            <Dashboard />
          ) : (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <h2 className="text-sm font-medium">Select a folder</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                Choose a project, then scan it. Diagnostics and folder sizes run together.
              </p>
            </div>
          )
        ) : null}

        {!state.scanning && state.workspaceTab === "diagnostics" ? <DiagnosticsPage /> : null}
        {!state.scanning && state.workspaceTab === "cleanup" ? <CleanupPage /> : null}
        </div>
    </div>
  );
}

function Dashboard() {
  const state = useAppState();
  const errors = state.scan?.summary.errors ?? 0;
  const warnings = state.scan?.summary.warnings ?? 0;
  const passed = state.scan?.summary.passed ?? 0;
  const ready = Boolean(state.projectPath) && !state.scan && state.cleanupListedBytes == null;

  if (ready) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
        <h2 className="text-sm font-medium">Ready to scan this project</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          Scan Project checks the toolchain and measures generated folders in one pass.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{state.scan ? "Scan complete." : "Folder sizes are ready."}</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-2xl border border-border bg-panel p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium">
            <HardDrive size={16} className="text-muted" />
            Cleanup
          </div>
          <p className="mt-1 text-sm text-muted">Generated folders and caches. Nothing is deleted from here.</p>
          <p className="mt-4 text-3xl font-semibold tabular-nums">
            {state.cleanupListedBytes != null ? formatBytes(state.cleanupListedBytes) : "—"}
          </p>
          <Button className="mt-4" variant="secondary" onClick={() => state.setWorkspaceTab("cleanup")}>
            Review details
          </Button>
        </article>
        <article className="rounded-2xl border border-border bg-panel p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Stethoscope size={16} className="text-muted" />
            Diagnostics
          </div>
          <p className="mt-1 text-sm text-muted">Toolchain, dependencies, Git, and ports.</p>
          <p className="mt-4 text-sm">
            <span className="text-success">{passed} passed</span>
            <span className="text-muted"> · </span>
            <span className="text-warning">{warnings} warnings</span>
            <span className="text-muted"> · </span>
            <span className="text-danger">{errors} {errors === 1 ? "error" : "errors"}</span>
          </p>
          <Button className="mt-4" variant="secondary" onClick={() => state.setWorkspaceTab("diagnostics")}>
            Review details
          </Button>
        </article>
      </div>
    </div>
  );
}

export function ScanAnimation() {
  const { scanProgress, scanDetails } = useAppState();
  const ratio = scanProgress?.total && scanProgress.total > 0 ? Math.min(1, scanProgress.completed / scanProgress.total) : null;
  const label = PHASE_LABEL[scanProgress?.phase ?? ""] ?? "Scanning";

  return (
    <section className="w-full max-w-md rounded-2xl border border-border bg-panel px-6 py-6 text-center shadow-sm">
      <span className="scan-pulse mx-auto block h-3 w-3 rounded-full bg-accent" />
      <p className="mt-4 text-sm font-medium">{label}</p>
      <p className="mt-1 truncate font-mono text-[11px] text-muted">{scanProgress?.detail ?? "Starting"}</p>
      <div className="mt-5 h-3 overflow-hidden rounded-full bg-border">
        {ratio == null ? (
          <div className="scan-indeterminate h-full rounded-full bg-accent" />
        ) : (
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(ratio * 100)}%` }} />
        )}
      </div>
      <p className="mt-2 text-xs tabular-nums text-muted">
        {scanProgress?.total != null ? `${scanProgress.completed} / ${scanProgress.total}` : "Working"}
      </p>
      <ul className="mt-3 space-y-0.5 font-mono text-[11px] text-muted">
        {scanDetails.map((line, index) => (
          <li key={`${index}-${line}`} className="truncate">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProjectInspector() {
  const state = useAppState();
  const entries = state.history.filter((entry) => entry.projectPath === state.projectPath);
  const meta = state.scan?.meta;

  return (
    <div className="space-y-4">
      <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted">Project info</h2>
      {state.scan && meta ? (
        <dl className="space-y-3 text-[12px]">
          <Info label="Type" value={state.scan.project.projectType} />
          <Info label="Path" value={state.scan.project.path} mono />
          <Info label="Git" value={meta.gitRepo ? (meta.gitBranch ?? "Unknown branch") : "Not a repository"} />
          <Info label="Working tree" value={meta.gitDirty == null ? "Unknown" : meta.gitDirty ? "Uncommitted changes" : "Clean"} />
          <Info label="Node" value={meta.nodeVersion ?? "Not detected"} />
          <Info label="Packages" value={meta.packageManagerVersion ? `${meta.packageManager} ${meta.packageManagerVersion}` : meta.packageManager} />
        </dl>
      ) : (
        <p className="text-[12px] text-muted">{state.projectPath ? basename(state.projectPath) : "No folder selected."}</p>
      )}
      <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted">Local history</h2>
      {entries.length === 0 ? (
        <p className="text-[12px] text-muted">No saved scan for this folder yet.</p>
      ) : (
        <ul className="space-y-2">
          {entries.slice(0, 8).map((entry) => (
            <li key={entry.id}>
              <button type="button" onClick={() => state.openHistoryEntry(entry)} className="w-full text-left text-[12px] hover:text-text">
                <span className="block text-muted">{formatWhen(entry.scannedAt)}</span>
                <span>
                  {entry.errorCount} errors · {entry.warningCount} warnings
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={cn("break-all", mono && "font-mono")}>{value}</dd>
    </div>
  );
}

function ProjectSelector({ disabled = false }: { disabled?: boolean }) {
  const state = useAppState();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const seen = new Set<string>();
  const recent = state.history.filter((entry) => {
    if (seen.has(entry.projectPath)) return false;
    seen.add(entry.projectPath);
    return true;
  }).slice(0, 8);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={root} className="relative min-w-0 flex-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-full max-w-xl items-center gap-2 rounded-lg border border-border bg-panel px-3 text-left hover:bg-panel-2 disabled:cursor-not-allowed"
      >
        <FolderOpen size={15} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{state.projectPath ? basename(state.projectPath) : "Select a folder"}</span>
          <span className="block truncate font-mono text-[11px] text-muted">{state.projectPath ?? "No folder selected"}</span>
        </span>
        <ChevronDown size={14} className="shrink-0 text-muted" />
      </button>
      {open ? (
        <div className="absolute z-20 mt-1 w-full max-w-xl overflow-hidden rounded-lg border border-border bg-panel shadow-sm">
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-panel-2"
            onClick={() => {
              setOpen(false);
              void state.chooseFolder();
            }}
          >
            Select folder
          </button>
          {state.samplePath ? (
            <button
              type="button"
              className="block w-full border-t border-border px-3 py-2 text-left text-sm hover:bg-panel-2"
              onClick={() => {
                setOpen(false);
                void state.openSample();
              }}
            >
              Scan sample project
            </button>
          ) : null}
          {recent.length > 0 ? (
            <ul className="max-h-64 overflow-y-auto border-t border-border">
              {recent.map((entry) => (
                <li key={entry.projectPath}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left hover:bg-panel-2"
                    onClick={() => {
                      setOpen(false);
                      state.openHistoryEntry(entry);
                    }}
                  >
                    <span className="block truncate text-sm">{entry.projectName}</span>
                    <span className="block truncate font-mono text-[11px] text-muted">{entry.projectPath}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
