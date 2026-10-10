import { Clock, FolderGit2, ScanSearch, Settings, Stethoscope } from "lucide-react";
import type { ReactNode } from "react";
import { basename, cn, formatWhen } from "../../lib/utils";
import { useAppState, type View } from "../../state/AppState";
import { DiagnosticsPage } from "../../pages/DiagnosticsPage";
import { HistoryPage } from "../../pages/HistoryPage";
import { OverviewPage } from "../../pages/OverviewPage";
import { ProjectsPage } from "../../pages/ProjectsPage";
import { SettingsPage } from "../../pages/SettingsPage";

const NAV: Array<{ id: View; label: string; icon: typeof ScanSearch }> = [
  { id: "overview", label: "Overview", icon: ScanSearch },
  { id: "projects", label: "Projects", icon: FolderGit2 },
  { id: "diagnostics", label: "Diagnostics", icon: Stethoscope },
  { id: "history", label: "History", icon: Clock },
  { id: "settings", label: "Settings", icon: Settings },
];

const TITLES: Record<View, string> = {
  overview: "Overview",
  projects: "Projects",
  diagnostics: "Diagnostics",
  history: "History",
  settings: "Settings",
};

export function AppShell() {
  const state = useAppState();
  const title = TITLES[state.view];
  const projectLabel = state.scan?.project.name ?? (state.projectPath ? basename(state.projectPath) : "No project");

  return (
    <div className="flex h-full bg-sidebar text-text">
      <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border py-2">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = state.view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              onClick={() => state.setView(item.id)}
              className={cn(
                "flex h-10 w-10 items-center justify-center border-l-2",
                active ? "border-accent text-text" : "border-transparent text-muted hover:text-text",
              )}
            >
              <Icon size={22} strokeWidth={1.5} />
            </button>
          );
        })}
      </nav>

      <aside className="hidden w-60 shrink-0 flex-col border-r border-border md:flex">
        <div className="flex h-[35px] items-center px-3 text-[11px] font-medium tracking-wide text-muted">DEV DOCTOR</div>
        <button
          type="button"
          onClick={() => void state.chooseFolder()}
          className="mx-2 truncate rounded-sm px-2 py-1 text-left text-[13px] hover:bg-hover"
        >
          {projectLabel}
        </button>
        <div className="mx-2 mt-1 flex gap-1">
          <button
            type="button"
            disabled={state.scanning}
            onClick={() => void state.scanCurrent()}
            className="rounded-sm px-2 py-1 text-[12px] text-muted hover:bg-hover hover:text-text disabled:opacity-50"
          >
            {state.scanning ? "Scanning…" : "Scan"}
          </button>
          <button
            type="button"
            onClick={() => void state.chooseFolder()}
            className="rounded-sm px-2 py-1 text-[12px] text-muted hover:bg-hover hover:text-text"
          >
            Open folder
          </button>
        </div>
        <div className="mt-3 px-4 text-[11px] font-medium tracking-wide text-muted">VIEWS</div>
        <div className="mt-1">
          {NAV.map((item) => {
            const active = state.view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => state.setView(item.id)}
                className={cn(
                  "flex h-7 w-full items-center px-4 text-left text-[13px]",
                  active ? "bg-active text-text" : "text-muted hover:bg-hover hover:text-text",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="mt-4 px-4 text-[11px] font-medium tracking-wide text-muted">RECENT</div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {state.history.length === 0 ? (
            <p className="px-4 py-2 text-[12px] text-muted">No scans yet</p>
          ) : (
            state.history.slice(0, 8).map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => state.openHistoryEntry(entry)}
                className="flex w-full flex-col px-4 py-1.5 text-left hover:bg-hover"
              >
                <span className="truncate text-[13px]">{entry.projectName}</span>
                <span className="truncate text-[11px] text-muted">
                  {formatWhen(entry.scannedAt)} · {entry.errorCount} errors
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-panel">
        <div className="flex h-[35px] shrink-0 items-end border-b border-border bg-sidebar">
          <div className="flex h-full items-center border-r border-border bg-panel px-3 text-[13px]">{title}</div>
        </div>
        {!state.desktop ? (
          <div className="border-b border-border px-4 py-1.5 text-[12px] text-warning">
            This browser preview cannot read local projects. Use the Dev Doctor desktop window.
          </div>
        ) : null}
        {state.scanError ? (
          <div className="border-b border-border px-4 py-1.5 text-[12px] text-danger">{state.scanError}</div>
        ) : null}
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl px-8 py-6">
              <Page />
            </div>
          </main>
          <Inspector />
        </div>
        <footer className="flex h-[22px] shrink-0 items-center gap-3 border-t border-border bg-sidebar px-2 text-[11px] text-muted">
          <span>{state.scanning ? "Scanning" : state.scan ? state.scan.health : "Ready"}</span>
          <span className="min-w-0 flex-1 truncate">{state.projectPath ?? "No folder"}</span>
          <span>v{state.appVersion}</span>
        </footer>
      </div>

      {state.toast ? (
        <div className="fixed bottom-8 right-3 border border-border bg-panel px-3 py-1.5 text-[12px]">{state.toast}</div>
      ) : null}
      {state.dragging ? (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-panel/80">
          <div className="border border-dashed border-accent px-6 py-4 text-[13px]">Drop a project folder</div>
        </div>
      ) : null}
    </div>
  );
}

function Inspector() {
  const { scan } = useAppState();
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-l border-border bg-sidebar xl:flex">
      <div className="flex h-[35px] items-center px-3 text-[11px] font-medium tracking-wide text-muted">OUTLINE</div>
      {scan ? (
        <dl className="space-y-3 px-3 py-1 text-[12px]">
          <Row label="Project" value={scan.project.name} />
          <Row label="Type" value={scan.project.projectType} />
          <Row label="Branch" value={scan.meta.gitBranch ?? "—"} />
          <Row label="Node" value={scan.meta.nodeVersion ?? "—"} />
          <Row label="Packages" value={scan.meta.packageManager} />
          <Row label="Errors" value={String(scan.summary.errors)} />
          <Row label="Warnings" value={String(scan.summary.warnings)} />
        </dl>
      ) : (
        <p className="px-3 text-[12px] text-muted">Scan a folder to see its outline.</p>
      )}
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

function Page(): ReactNode {
  const { view } = useAppState();
  if (view === "projects") return <ProjectsPage />;
  if (view === "diagnostics") return <DiagnosticsPage />;
  if (view === "history") return <HistoryPage />;
  if (view === "settings") return <SettingsPage />;
  return <OverviewPage />;
}
