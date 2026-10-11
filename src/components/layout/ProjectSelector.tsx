import { ChevronDown, FolderOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { projectSelectorButton } from "../../lib/ui-layout";
import { basename } from "../../lib/utils";
import { useAppState } from "../../state/AppState";

export function ProjectSelector({ disabled = false }: { disabled?: boolean }) {
  const state = useAppState();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const seen = new Set<string>();
  const compact = state.view !== "workspace";

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
        className={projectSelectorButton}
      >
        <FolderOpen size={15} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 leading-tight">
          {compact ? (
            <span className="block truncate text-[13px]">
              {state.projectPath ? basename(state.projectPath) : "Select a folder"}
            </span>
          ) : (
            <>
              <span className="block truncate text-[13px]">
                {state.projectPath ? basename(state.projectPath) : "Select a folder"}
              </span>
              <span className="block truncate font-mono text-[11px] text-muted">
                {state.projectPath ?? "No folder selected"}
              </span>
            </>
          )}
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
