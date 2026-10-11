import { Zap } from "lucide-react";
import { projectChromeRow } from "../../lib/ui-layout";
import { useAppState } from "../../state/AppState";
import { Button } from "../ui/button";
import { ProjectSelector } from "./ProjectSelector";

export function ProjectChromeBar() {
  const state = useAppState();
  const onWorkspace = state.view === "workspace";

  return (
    <div className={projectChromeRow}>
      <ProjectSelector disabled={state.scanning && onWorkspace} />
      <div className="flex shrink-0 items-center">
        {onWorkspace ? (
          <Button
            className="h-9"
            onClick={() => void state.scanCurrent()}
            disabled={state.scanning || !state.projectPath}
          >
            <Zap size={15} />
            {state.scanning ? "Scanning…" : "Scan Project"}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="h-9"
            onClick={() => {
              state.setView("workspace");
              state.setWorkspaceTab("dashboard");
            }}
          >
            Open workspace
          </Button>
        )}
      </div>
    </div>
  );
}
