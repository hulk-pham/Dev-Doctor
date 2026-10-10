import { FolderGit2, LayoutDashboard, PanelLeft, PanelRight, Settings } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { windowChrome, type ChromeButton } from "../../services/tauri";
import { useAppState, type View } from "../../state/AppState";
import { ProjectsPage } from "../../pages/ProjectsPage";
import { SettingsPage } from "../../pages/SettingsPage";
import { ProjectInspector, WorkspacePage } from "../../pages/WorkspacePage";

const NAV: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: "workspace", label: "Workspace", icon: LayoutDashboard },
  { id: "projects", label: "Projects", icon: FolderGit2 },
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
  const inspectorToggleStyle = zoom
    ? { right: 12, top: zoom.y, width: zoom.height, height: zoom.height }
    : { right: 12, top: 7, width: 16, height: 16 };

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
        <button
          type="button"
          title={state.inspectorOpen ? "Hide project info" : "Show project info"}
          aria-pressed={state.inspectorOpen}
          onClick={() => state.setInspectorOpen((open) => !open)}
          style={inspectorToggleStyle}
          className="absolute z-10 flex items-center justify-center text-muted hover:text-text"
        >
          <PanelRight size={14} strokeWidth={1.75} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
      <nav
        className={cn(
          "flex shrink-0 flex-col gap-1 border-r border-border py-1",
          menuExpanded ? "w-52 items-stretch px-2" : "w-12 items-center",
        )}
      >
        {NAV.map((item) => (
          <NavButton key={item.id} item={item} expanded={menuExpanded} active={state.view === item.id} onClick={() => state.setView(item.id)} />
        ))}
        <NavButton
          item={{ id: "settings", label: "Settings", icon: Settings }}
          expanded={menuExpanded}
          active={state.view === "settings"}
          onClick={() => state.setView("settings")}
          className="mt-auto"
        />
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
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="w-full px-8 py-6">
            <Page />
          </div>
        </main>
      </div>
      <aside
        style={{ width: state.inspectorOpen ? 288 : 0 }}
        className={cn(
          "h-full min-w-0 shrink-0 self-stretch overflow-hidden bg-sidebar transition-[width] duration-200",
          state.inspectorOpen ? "border-l border-border" : "border-l-0",
        )}
      >
        <div className="h-full overflow-y-auto px-4 py-4">
          <ProjectInspector />
        </div>
      </aside>
      </div>

      {state.toast ? (
        <div className="fixed bottom-3 right-3 border border-border bg-panel px-3 py-1.5 text-[12px]">{state.toast}</div>
      ) : null}
      {state.dragging ? (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-panel/80">
          <div className="border border-dashed border-accent px-6 py-4 text-[13px]">Drop a project folder</div>
        </div>
      ) : null}
    </div>
  );
}

function NavButton({
  item,
  expanded,
  active,
  onClick,
  className,
}: {
  item: { id: View; label: string; icon: typeof LayoutDashboard };
  expanded: boolean;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      title={item.label}
      onClick={onClick}
      className={cn(
        "flex h-10 items-center rounded-md",
        expanded ? "w-full justify-start gap-3 px-2" : "w-10 justify-center",
        active ? "bg-active text-text" : "text-muted hover:bg-hover hover:text-text",
        className,
      )}
    >
      <Icon size={22} strokeWidth={1.5} className="shrink-0" />
      {expanded ? <span className="truncate text-[13px]">{item.label}</span> : null}
    </button>
  );
}

function Page(): ReactNode {
  const { view } = useAppState();
  if (view === "projects") return <ProjectsPage />;
  if (view === "settings") return <SettingsPage />;
  return <WorkspacePage />;
}
