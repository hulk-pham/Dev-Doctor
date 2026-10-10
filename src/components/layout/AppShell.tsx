import { Clock, FolderGit2, PanelLeft, ScanSearch, Settings, Stethoscope } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { windowChrome, type ChromeButton } from "../../services/tauri";
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

export function AppShell() {
  const state = useAppState();
  const [menuExpanded, setMenuExpanded] = useState(false);
  const [buttons, setButtons] = useState<ChromeButton[]>([]);

  const zoom = buttons.find((button) => button.name === "zoom");
  const headerHeight = zoom ? zoom.y * 2 + zoom.height : 40;
  const toggleStyle = zoom
    ? {
        left: zoom.x + zoom.width + 14,
        top: zoom.y,
        width: zoom.height,
        height: zoom.height,
      }
    : { left: 80, top: 7, width: 16, height: 16 };

  useEffect(() => {
    if (!state.desktop) return;
    const read = () => {
      void windowChrome()
        .then((chrome) => setButtons(chrome.buttons))
        .catch(() => setButtons([]));
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, [state.desktop]);

  return (
    <div className="flex h-full flex-col bg-sidebar text-text">
      <header data-tauri-drag-region="deep" className="relative shrink-0" style={{ height: headerHeight }}>
        <button
          type="button"
          title={menuExpanded ? "Collapse menu" : "Expand menu"}
          aria-pressed={menuExpanded}
          onClick={() => setMenuExpanded((open) => !open)}
          style={toggleStyle}
          className="absolute z-10 flex items-center justify-center text-muted hover:text-text"
        >
          <PanelLeft size={14} strokeWidth={1.75} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
      <nav
        className={cn(
          "flex shrink-0 flex-col gap-1 border-r border-border py-1",
          menuExpanded ? "w-52 items-stretch px-2" : "w-12 items-center",
        )}
      >
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
                "flex h-10 items-center rounded-md",
                menuExpanded ? "w-full justify-start gap-3 px-2" : "w-10 justify-center",
                active ? "bg-active text-text" : "text-muted hover:bg-hover hover:text-text",
              )}
            >
              <Icon size={22} strokeWidth={1.5} className="shrink-0" />
              {menuExpanded ? <span className="truncate text-[13px]">{item.label}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col bg-panel">
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
            <div className="w-full px-8 py-6">
              <Page />
            </div>
          </main>
          <Inspector />
        </div>
      </div>
      </div>

      <footer className="flex h-[22px] shrink-0 items-center gap-3 border-t border-border bg-sidebar px-2 text-[11px] text-muted">
        <span>{state.scanning ? "Scanning" : state.scan ? state.scan.health : "Ready"}</span>
        <span className="min-w-0 flex-1 truncate">{state.projectPath ?? "No folder"}</span>
        <span>v{state.appVersion}</span>
      </footer>

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
      <div className="px-3 pt-3 pb-2 text-[11px] font-medium tracking-wide text-muted">OUTLINE</div>
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
