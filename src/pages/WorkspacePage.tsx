import { HardDrive, Stethoscope } from "lucide-react";
import { WorkspaceSegments } from "../components/layout/WorkspaceSegments";
import { CleanupPage } from "./CleanupPage";
import { DiagnosticsPage } from "./DiagnosticsPage";
import { Button } from "../components/ui/button";
import { ecosystemLabel } from "../diagnostics/engine";
import { workspaceNextStep } from "../domain/workspace-next-step";
import { insetBar, stack, summaryTile } from "../lib/ui-layout";
import { basename, cn, formatBytes } from "../lib/utils";
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
    <div className={cn("space-y-3", state.scanning && "pointer-events-none opacity-60")}>
      <WorkspaceSegments />

      <div className={cn("relative min-h-[calc(100vh-11rem)] pt-3", stack)}>
        {state.scanning ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-panel">
            <ScanAnimation />
          </div>
        ) : null}

        {!state.scanning && state.workspaceTab === "dashboard" ? (
          state.boundary ? (
            <BoundaryNotice />
          ) : hasResult || state.projectPath ? (
            <Dashboard />
          ) : (
            <div className="rounded-lg border border-dashed border-border px-5 py-10 text-center">
              <p className="text-[13px] font-medium">Select a folder</p>
              <p className="mt-1 text-[11px] text-muted">Then scan to measure folders and run diagnostics.</p>
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
  const next = workspaceNextStep(state.scan, state.cleanupListedBytes, Boolean(state.projectPath));

  function runNextStep() {
    if (next.kind === "scan") {
      if (state.projectPath) void state.scanCurrent();
      else void state.chooseFolder();
      return;
    }
    if (next.kind === "cleanup") {
      state.setWorkspaceTab("cleanup");
      return;
    }
    if (next.kind === "errors") {
      state.openDiagnosticsTab("error");
      return;
    }
    if (next.kind === "warnings") {
      state.openDiagnosticsTab("warning");
      return;
    }
    state.openDiagnosticsTab("all");
  }

  return (
    <div className={stack}>
      {state.openedInside ? (
        <p className="text-[11px] text-muted">Opened {state.openedInside}, the project inside the folder you chose.</p>
      ) : null}
      <div className={insetBar}>
        <p className="text-[13px] text-muted">{next.message}</p>
        <Button size="sm" variant="secondary" className="shrink-0" onClick={runNextStep}>
          {next.actionLabel}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => state.setWorkspaceTab("cleanup")} className={summaryTile}>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted">
            <HardDrive size={14} />
            Cleanup
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {state.cleanupListedBytes != null ? formatBytes(state.cleanupListedBytes) : "—"}
          </p>
          <p className="mt-auto pt-2 text-[11px] text-muted">Reclaimable</p>
        </button>
        <button type="button" onClick={() => state.setWorkspaceTab("diagnostics")} className={summaryTile}>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted">
            <Stethoscope size={14} />
            Diagnostics
          </div>
          <p className="mt-2 text-[13px] tabular-nums">
            <span className="text-danger">{errors}E</span>
            <span className="text-muted"> · </span>
            <span className="text-warning">{warnings}W</span>
            <span className="text-muted"> · </span>
            <span className="text-success">{passed} ok</span>
          </p>
          <p className="mt-auto pt-2 text-[11px] text-muted">Last scan</p>
        </button>
      </div>
    </div>
  );
}

export function ScanAnimation() {
  const { scanProgress, scanDetails } = useAppState();
  const ratio = scanProgress?.total && scanProgress.total > 0 ? Math.min(1, scanProgress.completed / scanProgress.total) : null;
  const label = PHASE_LABEL[scanProgress?.phase ?? ""] ?? "Scanning";

  return (
    <section className="w-full max-w-md rounded-lg border border-border bg-panel px-6 py-6 text-center">
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
  const meta = state.scan?.meta;
  const lastCleanup = state.cleanupHistory.find((entry) => entry.projectPath === state.projectPath);

  return (
    <div className="space-y-3 text-[12px]">
      {state.scan && meta ? (
        <dl className="space-y-2">
          <Info label="Type" value={state.scan.project.projectType} />
          <Info label="Git" value={meta.gitRepo ? (meta.gitBranch ?? "—") : "Not a repo"} />
          <Info label="Node" value={meta.nodeVersion ?? "—"} />
          <Info label="Packages" value={meta.packageManagerVersion ? `${meta.packageManager} ${meta.packageManagerVersion}` : meta.packageManager} />
        </dl>
      ) : (
        <p className="text-muted">{state.projectPath ? basename(state.projectPath) : "No folder selected."}</p>
      )}
      {lastCleanup ? (
        <p className="text-[11px] text-muted">
          Last cleanup: {formatBytes(lastCleanup.reclaimedBytes)} reclaimed
        </p>
      ) : null}
      <Button size="sm" variant="secondary" className="w-full" onClick={() => state.setView("projects")}>
        All scans in Projects
      </Button>
    </div>
  );
}

function BoundaryNotice() {
  const state = useAppState();
  const layout = state.boundary;
  if (!layout) return null;
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[13px] font-medium">This folder contains several projects</p>
        <p className="mt-1 text-[11px] text-muted">
          Dev Doctor will not scan it as one project, and it will not run npm checks on the parent. Open one project below.
        </p>
        {layout.truncated ? (
          <p className="mt-1 text-[11px] text-muted">The list stopped early because the folder is large.</p>
        ) : null}
      </div>
      <ul className="overflow-hidden rounded-lg border border-border">
        {layout.projects.map((project) => (
          <li key={project.path} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">{project.name}</span>
              <span className="block truncate font-mono text-[11px] text-muted">{project.path}</span>
            </span>
            <span className="shrink-0 text-[11px] text-muted">{ecosystemLabel(project.ecosystem)}</span>
            <Button size="sm" variant="secondary" onClick={() => void state.scanFolder(project.path)}>
              Open
            </Button>
          </li>
        ))}
      </ul>
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
