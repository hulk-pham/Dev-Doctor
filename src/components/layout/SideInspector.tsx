import { cn } from "../../lib/utils";
import { useAppState, type SidePanelTab } from "../../state/AppState";
import { AiChatPanel } from "../ai/AiChatPanel";
import { ProjectInspector } from "../../pages/WorkspacePage";

const TABS: Array<{ id: SidePanelTab; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "project", label: "Project" },
];

export function SideInspector() {
  const state = useAppState();
  const tab = state.sidePanelTab;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav className="-mx-3 mb-1 flex gap-3 border-b border-border px-3" aria-label="Side panel">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => state.setSidePanelTab(item.id)}
            className={cn(
              "-mb-px border-b-2 px-0.5 py-1.5 text-[12px] font-medium transition-colors",
              tab === item.id ? "border-accent text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "chat" ? <AiChatPanel /> : <ProjectInspector />}
      </div>
    </div>
  );
}
