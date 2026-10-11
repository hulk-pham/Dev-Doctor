import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RefreshCw } from "lucide-react";
import { MachineSegments, type MachineTab } from "../components/layout/MachineSegments";
import { Button } from "../components/ui/button";
import { ScreenToolbar, ToolbarEnd, ToolbarGroup, ToolbarIconButton, ToolbarStatus } from "../components/ui/screen-toolbar";
import { SegmentedFilter } from "../components/ui/segmented-filter";
import { Switch } from "../components/ui/switch";
import { formatTcpPorts, processHasPort, processMatchesQuery, projectForProcess } from "../diagnostics/processes";
import { validatePort } from "../diagnostics/ports";
import { chartPoints, formatMonitorWhen, formatUptimeFromStart, polylineFromPoints } from "../lib/monitor-display";
import { insetBar, stack } from "../lib/ui-layout";
import { cn, errorMessage, formatBytes } from "../lib/utils";
import {
  AlertsList,
  CurrentHealth,
  TrendsCharts,
  type AlertScope,
  type AlertStateFilter,
  type AlertTimeFilter,
} from "./machine/panels";
import type { AlertHistoryQuery, MonitorSample } from "../domain/types";
import { listProcesses, monitorRecent, terminateProcess, type ProcessInfo } from "../services/tauri";
import { useAppState } from "../state/AppState";

const LIST_REFRESH_MS = 5000;
const CHART_H = 64;
type RangeId = "15m" | "1h";

export function ProcessesPage() {
  const state = useAppState();
  const tab = state.machineTab;

  const [rows, setRows] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [highlightPort, setHighlightPort] = useState<number | null>(null);
  const [portHint, setPortHint] = useState<string | null>(null);
  const [liveRefresh, setLiveRefresh] = useState(true);
  const [showAllProcesses, setShowAllProcesses] = useState(false);
  const [thisProjectOnly, setThisProjectOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const pendingFindPort = useRef<string | null>(null);

  const [range, setRange] = useState<RangeId>("15m");
  const [alertScope, setAlertScope] = useState<AlertScope>("active");
  const [alertStateFilter, setAlertStateFilter] = useState<AlertStateFilter>("all");
  const [alertTimeFilter, setAlertTimeFilter] = useState<AlertTimeFilter>("7d");
  const [alertRuleFilter, setAlertRuleFilter] = useState<string>("all");
  const [samples, setSamples] = useState<MonitorSample[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const alertQuery = useMemo((): AlertHistoryQuery | undefined => {
    if (alertScope === "active") return { state: "active" };
    const query: AlertHistoryQuery = {};
    if (alertStateFilter !== "all") query.state = alertStateFilter;
    if (alertRuleFilter !== "all") query.ruleId = alertRuleFilter;
    const windowMs =
      alertTimeFilter === "24h"
        ? 24 * 60 * 60 * 1000
        : alertTimeFilter === "7d"
          ? 7 * 24 * 60 * 60 * 1000
          : alertTimeFilter === "30d"
            ? 30 * 24 * 60 * 60 * 1000
            : 0;
    if (windowMs > 0) query.sinceMs = Date.now() - windowMs;
    return query;
  }, [alertScope, alertStateFilter, alertTimeFilter, alertRuleFilter]);

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

  const refreshList = useCallback(
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

  const refreshTrends = useCallback(async () => {
    if (!state.desktop) return;
    setTrendsLoading(true);
    try {
      const next = await monitorRecent(range);
      setSamples(next);
      state.syncMonitorSamples(next);
      await state.refreshMonitorStorageStatus();
    } finally {
      setTrendsLoading(false);
    }
  }, [range, state.desktop, state.syncMonitorSamples, state.refreshMonitorStorageStatus]);

  useEffect(() => {
    if (!state.desktop) return;
    void refreshList(true);
  }, [state.desktop, refreshList, state.processesNonce]);

  useEffect(() => {
    if (!state.desktop || !liveRefresh || tab !== "processes") return;
    const timer = window.setInterval(() => {
      if (!confirming && !stopping) void refreshList(false);
    }, LIST_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [state.desktop, liveRefresh, tab, confirming, stopping, refreshList]);

  useEffect(() => {
    if (tab === "processes") return;
    void refreshTrends();
  }, [tab, refreshTrends]);

  useEffect(() => {
    if (tab !== "alerts") return;
    void state.refreshMonitorAlerts(alertQuery);
  }, [tab, alertQuery, state.refreshMonitorAlerts]);

  useEffect(() => {
    if (!state.monitorLatest) return;
    setSamples((current) => {
      if (current.some((sample) => sample.atMs === state.monitorLatest?.atMs)) return current;
      return [...current, state.monitorLatest!].slice(-360);
    });
  }, [state.monitorLatest?.atMs]);

  useEffect(() => {
    if (!state.processesPortQuery) return;
    pendingFindPort.current = state.processesPortQuery;
    state.setMachineTab("processes");
    state.clearProcessesPortQuery();
  }, [state.processesPortQuery, state.clearProcessesPortQuery, state.setMachineTab]);

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
      await refreshList();
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

  const monitorByPid = useMemo(() => {
    const map = new Map<number, { startTime: number; uptime: string }>();
    if (!state.monitorStatus?.running || !state.monitorLatest) return map;
    for (const process of state.monitorLatest.processes) {
      map.set(process.pid, {
        startTime: process.startTime,
        uptime: formatUptimeFromStart(process.startTime),
      });
    }
    return map;
  }, [state.monitorLatest, state.monitorStatus?.running]);

  const samplerRunning = Boolean(state.monitorStatus?.running);
  const latest = samples[samples.length - 1] ?? state.monitorLatest;
  const lastTick = formatMonitorWhen(state.monitorStatus?.lastAtMs ?? latest?.atMs);
  const activeAlerts = state.monitorAlerts.filter((alert) => alert.state === "active");

  const cpuLine = useMemo(
    () => polylineFromPoints(chartPoints(samples, (s) => s.system.cpuPercent), CHART_H, 100),
    [samples],
  );
  const diskLine = useMemo(() => {
    const max = Math.max(...samples.map((s) => s.disk.availableBytes ?? 0), 1);
    return polylineFromPoints(
      chartPoints(samples, (s) => (s.disk.availableBytes != null ? (s.disk.availableBytes / max) * 100 : null)),
      CHART_H,
      100,
    );
  }, [samples]);
  const pressureLine = useMemo(
    () =>
      polylineFromPoints(
        chartPoints(samples, (s) => s.system.memoryPressure?.statusLevel ?? null),
        CHART_H,
        100,
      ),
    [samples],
  );

  const onTabChange = (next: MachineTab) => {
    state.setMachineTab(next);
  };

  const storageDegraded = Boolean(state.monitorStatus?.storageDegraded || state.monitorStorageStatus?.degraded);
  const storageNote = state.monitorStatus?.storageMessage ?? state.monitorStorageStatus?.message;
  const ruleFilterOptions = useMemo(() => {
    const rules = state.monitorSettings?.rules ?? [];
    return [{ id: "all", label: "All rules" }, ...rules.map((rule) => ({ id: rule.id, label: rule.id }))];
  }, [state.monitorSettings?.rules]);

  return (
    <div className={stack}>
      <p className="text-[11px] text-muted">This Mac — running processes, resource trends, and watchdog alerts.</p>
      <MachineSegments tab={tab} activeAlertCount={activeAlerts.length} onChange={onTabChange} />

      <div className={cn("pt-3", stack)}>
        {storageDegraded ? (
          <div className={insetBar}>
            <p className="text-[13px] text-muted">
              Monitoring history is in memory only{storageNote ? `: ${storageNote}` : "."} Trends and alert history reset when you quit.
            </p>
          </div>
        ) : null}
        <ScreenToolbar>
          <ToolbarGroup>
            {tab === "processes" ? (
              <>
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
              </>
            ) : tab === "trends" ? (
              <SegmentedFilter
                aria-label="Chart range"
                value={range}
                options={[
                  { id: "15m", label: "15 min" },
                  { id: "1h", label: "1 h" },
                ]}
                onChange={(id) => setRange(id as RangeId)}
              />
            ) : (
              <>
                <SegmentedFilter
                  aria-label="Alert scope"
                  value={alertScope}
                  options={[
                    { id: "active", label: "Active" },
                    { id: "history", label: "History" },
                  ]}
                  onChange={(id) => setAlertScope(id as AlertScope)}
                />
                {alertScope === "history" ? (
                  <>
                    <SegmentedFilter
                      aria-label="Alert state"
                      value={alertStateFilter}
                      options={[
                        { id: "all", label: "All states" },
                        { id: "active", label: "Active" },
                        { id: "recovered", label: "Recovered" },
                        { id: "dismissed", label: "Dismissed" },
                      ]}
                      onChange={(id) => setAlertStateFilter(id as AlertStateFilter)}
                    />
                    <SegmentedFilter
                      aria-label="Alert time"
                      value={alertTimeFilter}
                      options={[
                        { id: "24h", label: "24 h" },
                        { id: "7d", label: "7 d" },
                        { id: "30d", label: "30 d" },
                        { id: "all", label: "All time" },
                      ]}
                      onChange={(id) => setAlertTimeFilter(id as AlertTimeFilter)}
                    />
                    <SegmentedFilter
                      aria-label="Alert rule"
                      value={alertRuleFilter}
                      options={ruleFilterOptions}
                      onChange={setAlertRuleFilter}
                    />
                  </>
                ) : null}
              </>
            )}
          </ToolbarGroup>
          <ToolbarEnd>
            {tab === "processes" ? (
              <>
                <ToolbarStatus>
                  {!liveRefresh ? "List paused · " : ""}
                  {updatedAt ? updatedAt.toLocaleTimeString() : "—"}
                </ToolbarStatus>
                <ToolbarIconButton
                  icon={liveRefresh ? Pause : Play}
                  label={liveRefresh ? "Pause list refresh" : "Resume list refresh"}
                  onClick={() => setLiveRefresh((on) => !on)}
                />
                <ToolbarIconButton icon={RefreshCw} label="Refresh process list" disabled={loading} onClick={() => void refreshList()} />
              </>
            ) : (
              <>
                <ToolbarStatus>{samplerRunning ? lastTick || "Sampling…" : "Sampler off"}</ToolbarStatus>
                {samplerRunning ? (
                  <ToolbarIconButton icon={Pause} label="Turn sampling off" onClick={() => void state.disableMonitoring()} />
                ) : null}
                <ToolbarIconButton
                  icon={RefreshCw}
                  label={tab === "alerts" ? "Refresh alerts" : "Refresh trends"}
                  disabled={tab === "alerts" ? false : trendsLoading || !samplerRunning}
                  onClick={() => (tab === "alerts" ? void state.refreshMonitorAlerts(alertQuery) : void refreshTrends())}
                />
              </>
            )}
          </ToolbarEnd>
        </ScreenToolbar>

        {tab !== "processes" && !samplerRunning ? (
          <div className={insetBar}>
            <p className="text-[13px] text-muted">Turn on sampling to fill trends and run watchdog rules.</p>
            <Button size="sm" variant="secondary" className="shrink-0" onClick={() => void state.enableMonitoring()}>
              Turn on
            </Button>
          </div>
        ) : null}

        {tab === "processes" ? (
          <ProcessesListBody
            error={error}
            highlightPort={highlightPort}
            portHint={portHint}
            query={query}
            showAllProcesses={showAllProcesses}
            thisProjectOnly={thisProjectOnly}
            sortedRows={sortedRows}
            selectedPid={selectedPid}
            selected={selected}
            monitorByPid={monitorByPid}
            confirming={confirming}
            stopping={stopping}
            onClearPortHighlight={() => {
              setHighlightPort(null);
              setPortHint(null);
            }}
            onSelectPid={(pid, expanded) => {
              setSelectedPid(expanded ? null : pid);
              setConfirming(false);
            }}
            onConfirmStop={() => setConfirming(true)}
            onCancelStop={() => setConfirming(false)}
            onStop={() => selected && void stop(selected)}
            onShowAll={() => setShowAllProcesses(true)}
            onOpenProject={(path) => state.openProjectInWorkspace(path)}
            onExplain={
              state.aiExplainAvailable
                ? (row, project) =>
                    state.openDiagnosisFromProcess({
                      pid: row.pid,
                      name: row.name,
                      command: row.command,
                      cwd: row.cwd,
                      cpuPercent: row.cpuPercent,
                      memoryBytes: row.memoryBytes,
                      tcpPorts: row.tcpPorts,
                      matchedProjectPath: project?.path ?? null,
                    })
                : undefined
            }
          />
        ) : null}

        {tab === "trends" ? (
          <>
            <CurrentHealth latest={latest} />
            <TrendsCharts
              running={samplerRunning}
              sampleCount={samples.length}
              latest={latest}
              cpuLine={cpuLine}
              pressureLine={pressureLine}
              diskLine={diskLine}
            />
          </>
        ) : null}

        {tab === "alerts" && !state.aiExplainAvailable ? (
          <p className="text-[11px] text-muted">
            Add an API key under Settings → AI &amp; Privacy to enable Explain with AI on alerts.
          </p>
        ) : null}

        {tab === "alerts" ? (
          <AlertsList
            alerts={state.monitorAlerts}
            scope={alertScope}
            focusedId={state.focusedAlertId}
            onFocus={(id) => state.focusMonitorAlert(id)}
            onDismiss={(id) => void state.dismissMonitorAlert(id)}
            onMute={(ruleId) => void state.muteMonitorRule(ruleId)}
            onOpenSettings={() => state.setView("settings")}
            onExplain={state.aiExplainAvailable ? (alert) => state.openDiagnosisFromAlert(alert) : undefined}
          />
        ) : null}
      </div>
    </div>
  );
}

function ProcessesListBody({
  error,
  highlightPort,
  portHint,
  query,
  showAllProcesses,
  thisProjectOnly,
  sortedRows,
  selectedPid,
  selected,
  monitorByPid,
  confirming,
  stopping,
  onClearPortHighlight,
  onSelectPid,
  onConfirmStop,
  onCancelStop,
  onStop,
  onShowAll,
  onOpenProject,
  onExplain,
}: {
  error: string | null;
  highlightPort: number | null;
  portHint: string | null;
  query: string;
  showAllProcesses: boolean;
  thisProjectOnly: boolean;
  sortedRows: Array<{ row: ProcessInfo; project: { path: string; name: string } | null }>;
  selectedPid: number | null;
  selected: ProcessInfo | null;
  monitorByPid: Map<number, { startTime: number; uptime: string }>;
  confirming: boolean;
  stopping: boolean;
  onClearPortHighlight: () => void;
  onSelectPid: (pid: number, expanded: boolean) => void;
  onConfirmStop: () => void;
  onCancelStop: () => void;
  onStop: () => void;
  onShowAll: () => void;
  onOpenProject: (path: string) => void;
  onExplain?: (row: ProcessInfo, project: { path: string; name: string } | null) => void;
}) {
  return (
    <>
      {highlightPort != null ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span className="font-mono">:{highlightPort}</span>
          {portHint ? <span>{portHint}</span> : null}
          <button type="button" className="text-accent hover:underline" onClick={onClearPortHighlight}>
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
              <button type="button" className="text-accent hover:underline" onClick={onShowAll}>
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
                  onClick={() => onSelectPid(row.pid, expanded)}
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
                      {monitorByPid.get(row.pid) ? ` · up ${monitorByPid.get(row.pid)!.uptime}` : row.elapsed ? ` · ${row.elapsed}` : ""}
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
                      <Button size="sm" variant="secondary" onClick={() => onOpenProject(project.path)}>
                        Open in Workspace
                      </Button>
                    ) : null}
                    {onExplain ? (
                      <Button size="sm" variant="secondary" onClick={() => onExplain(selected, project)}>
                        Explain with AI
                      </Button>
                    ) : null}
                    {confirming ? (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="danger" disabled={stopping} onClick={onStop}>
                          {stopping ? "Stopping…" : "Confirm stop"}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={onCancelStop}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="danger" onClick={onConfirmStop}>
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
    </>
  );
}
