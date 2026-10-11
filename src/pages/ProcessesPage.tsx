import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";
import { ScreenToolbar, ToolbarEnd, ToolbarGroup, ToolbarIconButton, ToolbarStatus } from "../components/ui/screen-toolbar";
import { SegmentedFilter } from "../components/ui/segmented-filter";
import { Switch } from "../components/ui/switch";
import { formatTcpPorts, processHasPort, processMatchesQuery, projectForProcess } from "../diagnostics/processes";
import { validatePort } from "../diagnostics/ports";
import { errorMessage, formatBytes } from "../lib/utils";
import { listProcesses, terminateProcess, type ProcessInfo } from "../services/tauri";
import { useAppState } from "../state/AppState";

const MONITOR_MS = 5000;

export function ProcessesPage() {
  const state = useAppState();
  const [rows, setRows] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [highlightPort, setHighlightPort] = useState<number | null>(null);
  const [portHint, setPortHint] = useState<string | null>(null);
  const [monitoring, setMonitoring] = useState(true);
  const [showAllProcesses, setShowAllProcesses] = useState(false);
  const [thisProjectOnly, setThisProjectOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const pendingFindPort = useRef<string | null>(null);
  const projects = useMemo(() => {
    const seen = new Set<string>();
    const refs = state.history.flatMap((entry) => {
      if (seen.has(entry.projectPath)) return [];
      seen.add(entry.projectPath);
      return [{ path: entry.projectPath, name: entry.projectName }];
    });
    if (state.projectPath && !seen.has(state.projectPath)) {
      const name = state.projectPath.split("/").filter(Boolean).pop() ?? state.projectPath;
      refs.push({ path: state.projectPath, name });
    }
    return refs;
  }, [state.history, state.projectPath]);

  const refresh = useCallback(
    async (initial = false) => {
      if (initial) setLoading(true);
      setError(null);
      try {
        const next = await listProcesses(showAllProcesses);
        setRows(next);
        setUpdatedAt(new Date());
        setSelectedPid((current) => (current ? next.find((row) => row.pid === current)?.pid ?? null : null));
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setLoading(false);
      }
    },
    [showAllProcesses],
  );

  useEffect(() => {
    if (!state.desktop) return;
    void refresh(true);
  }, [state.desktop, refresh, state.processesNonce]);

  useEffect(() => {
    if (!state.desktop || !monitoring) return;
    const timer = window.setInterval(() => {
      if (!confirming && !stopping) void refresh(false);
    }, MONITOR_MS);
    return () => window.clearInterval(timer);
  }, [state.desktop, monitoring, confirming, stopping, refresh]);

  useEffect(() => {
    if (!state.processesPortQuery) return;
    pendingFindPort.current = state.processesPortQuery;
    state.clearProcessesPortQuery();
  }, [state.processesPortQuery, state.clearProcessesPortQuery]);

  useEffect(() => {
    if (!pendingFindPort.current || loading) return;
    const port = pendingFindPort.current;
    pendingFindPort.current = null;
    setQuery(port);
    void findPort(port);
  }, [loading, rows]);

  async function findPort(query: string) {
    setPortHint(null);
    const check = validatePort(query);
    if (!check.ok) {
      setPortHint(check.reason);
      return;
    }
    const match = rows.find((row) => processHasPort(row, check.port));
    if (match) {
      if (!match.development) setShowAllProcesses(true);
      setHighlightPort(check.port);
      setSelectedPid(match.pid);
      setConfirming(false);
      setPortHint(`Port ${check.port} · ${match.name} (PID ${match.pid})`);
      return;
    }
    const inspected = await state.inspectPortNumber(query);
    if (!inspected) return;
    if (inspected.listening && inspected.pid) {
      const byPid = rows.find((row) => row.pid === inspected.pid);
      if (byPid) {
        if (!byPid.development) setShowAllProcesses(true);
        setHighlightPort(check.port);
        setSelectedPid(byPid.pid);
        setConfirming(false);
        setPortHint(`Port ${check.port} · ${byPid.name} (PID ${byPid.pid})`);
        return;
      }
      setPortHint(`Port ${check.port} listens as PID ${inspected.pid} (outside this list).`);
      return;
    }
    setHighlightPort(check.port);
    setPortHint(`Port ${check.port} is not listening.`);
  }

  async function stop(row: ProcessInfo) {
    setStopping(true);
    setError(null);
    try {
      await terminateProcess(row.pid);
      setConfirming(false);
      setSelectedPid(null);
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setStopping(false);
    }
  }

  const sortedRows = useMemo(() => {
    let list = rows.map((row) => ({ row, project: projectForProcess(row, projects) }));
    if (thisProjectOnly && state.projectPath) {
      list = list.filter(({ project }) => project != null);
    }
    const needle = query.trim();
    if (needle) {
      list = list.filter(({ row }) => processMatchesQuery(row, needle));
    }
    return list.sort((left, right) => {
      const leftScore = Number(Boolean(right.project)) - Number(Boolean(left.project));
      if (leftScore !== 0) return leftScore;
      const portScore = Number(right.row.tcpPorts.length > 0) - Number(left.row.tcpPorts.length > 0);
      if (portScore !== 0) return portScore;
      return right.row.cpuPercent - left.row.cpuPercent;
    });
  }, [rows, projects, thisProjectOnly, state.projectPath, query]);

  const selected = selectedPid != null ? rows.find((row) => row.pid === selectedPid) ?? null : null;

  return (
    <div className="space-y-2">
      <ScreenToolbar>
        <ToolbarGroup>
          <SegmentedFilter
            aria-label="Process scope"
            value={showAllProcesses ? "all" : "dev"}
            options={[
              { id: "dev", label: "Dev" },
              { id: "all", label: "All" },
            ]}
            onChange={(id) => setShowAllProcesses(id === "all")}
          />
          <Switch
            checked={Boolean(state.projectPath) && thisProjectOnly}
            disabled={!state.projectPath}
            label="This project"
            onChange={setThisProjectOnly}
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or port"
            aria-label="Search by process name or port"
            className="h-8 w-40 rounded-lg border border-border bg-panel-2 px-2 text-[13px]"
          />
        </ToolbarGroup>
        <ToolbarEnd>
          <ToolbarStatus>
            {!monitoring ? "Paused · " : ""}
            {updatedAt ? updatedAt.toLocaleTimeString() : ""}
          </ToolbarStatus>
          <ToolbarIconButton
            icon={monitoring ? Pause : Play}
            label={monitoring ? "Pause auto-refresh" : "Resume auto-refresh"}
            onClick={() => setMonitoring((on) => !on)}
          />
          <ToolbarIconButton icon={RefreshCw} label="Refresh process list" disabled={loading} onClick={() => void refresh()} />
        </ToolbarEnd>
      </ScreenToolbar>
      {highlightPort != null ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span className="font-mono">:{highlightPort}</span>
          {portHint ? <span>{portHint}</span> : null}
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={() => {
              setHighlightPort(null);
              setPortHint(null);
            }}
          >
            Clear
          </button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {sortedRows.length === 0 ? (
        <p className="text-[11px] text-muted">
          {query.trim()
            ? "No processes match this search."
            : thisProjectOnly
              ? "No processes matched this project."
              : "No processes match this scope."}
          {!showAllProcesses ? (
            <>
              {" "}
              <button type="button" className="text-accent hover:underline" onClick={() => setShowAllProcesses(true)}>
                Show all
              </button>
            </>
          ) : null}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border">
          {sortedRows.map(({ row, project }) => {
            const portLabel = formatTcpPorts(row.tcpPorts);
            const portMatch = highlightPort != null && processHasPort(row, highlightPort);
            const expanded = selectedPid === row.pid;
            return (
              <li key={row.pid} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPid(expanded ? null : row.pid);
                    setConfirming(false);
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-panel-2 ${
                    project ? "bg-accent/10" : ""
                  } ${portMatch ? "ring-1 ring-inset ring-accent/50" : ""} ${expanded ? "bg-panel-2" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2 truncate text-[13px]">
                      <span className="truncate">{row.name}</span>
                      {project ? <span className="shrink-0 text-[11px] text-accent">{project.name}</span> : null}
                    </span>
                    <span className="font-mono text-[11px] text-muted">
                      PID {row.pid} · {row.cpuPercent.toFixed(1)}% · {formatBytes(row.memoryBytes)}
                    </span>
                  </span>
                  {portLabel ? (
                    <span className="shrink-0 font-mono text-[11px] text-text">{portLabel}</span>
                  ) : (
                    <span className="shrink-0 text-[11px] text-muted">—</span>
                  )}
                </button>
                {expanded && selected ? (
                  <div className="space-y-2 border-t border-border bg-panel-2/40 px-3 py-2 text-[12px]">
                    <p className="font-mono text-[11px] text-muted">{selected.command}</p>
                    {selected.cwd ? <p className="font-mono text-[11px] text-muted">{selected.cwd}</p> : null}
                    {project ? (
                      <Button size="sm" variant="secondary" onClick={() => state.openProjectInWorkspace(project.path)}>
                        Open in Workspace
                      </Button>
                    ) : null}
                    {confirming ? (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="danger" disabled={stopping} onClick={() => void stop(selected)}>
                          {stopping ? "Stopping…" : "Confirm stop"}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
                        Stop process
                      </Button>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
