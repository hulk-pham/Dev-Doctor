import { cn } from "../../lib/utils";
import { useAppState, type WorkspaceTab } from "../../state/AppState";

const TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "dashboard", label: "Overview" },
  { id: "cleanup", label: "Cleanup" },
  { id: "diagnostics", label: "Diagnostics" },
];

export function WorkspaceSegments() {
  const state = useAppState();
  if (!state.projectPath) return null;

  return (
    <nav className="-mb-px flex gap-1 border-b border-border" aria-label="Workspace sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => state.setWorkspaceTab(tab.id)}
          className={cn(
            "border-b-2 px-3 py-2 text-[13px] transition-colors",
            state.workspaceTab === tab.id
              ? "border-accent text-text"
              : "border-transparent text-muted hover:text-text",
          )}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
