import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { prependHistory, scanFromHistory, toHistoryEntry } from "../domain/history";
import type {
  CleanupHistoryEntry,
  DiagnosticFinding,
  FixExecutionResult,
  FixSuggestion,
  MonitorSample,
  MonitorAlert,
  MonitorAlertEvent,
  AlertHistoryQuery,
  MonitorSettings,
  MonitorStatus,
  MonitorStorageStatus,
  PortInspection,
  ScanHistoryEntry,
  ScanResult,
} from "../domain/types";
import {
  buildAlertContextItems,
  buildArtifactContextItems,
  buildFindingContextItems,
  buildProcessContextItems,
  composeContextText,
} from "../ai/context-builder";
import type { AiContextItem, DiagnosisSession } from "../ai/types";
import { classifyArtifacts, type ArtifactFinding } from "../diagnostics/artifacts";
import { buildScanResult } from "../diagnostics/engine";
import { validateFixRequest, validateProjectPath } from "../diagnostics/paths";
import { validatePort } from "../diagnostics/ports";
import { errorMessage } from "../lib/utils";
import {
  appMetadata,
  checkForUpdate,
  classifyFolder,
  collectSnapshot,
  deleteArtifacts,
  executeFix,
  inspectPort,
  loadCleanupHistory,
  loadHistory,
  monitorAlertDismiss,
  monitorAlertMuteRule,
  monitorAlertsList,
  monitorAlertsQuery,
  monitorClearHistory,
  monitorStorageStatus as fetchMonitorStorageStatus,
  aiSettingsLoad,
  aiSettingsSave,
  aiKeyStatus as fetchAiKeyStatus,
  aiKeySave,
  aiKeyDelete,
  aiTestConnection,
  aiDiagnose,
  monitorSettingsLoad,
  monitorSettingsSave,
  monitorStart,
  monitorStatus as fetchMonitorStatus,
  monitorStop,
  openAllowedUrl,
  saveCleanupHistory,
  saveHistory,
  scanArtifacts,
  terminateProcess,
  type ArtifactScanProgress,
  type FolderLayout,
  type UpdateCheck,
} from "../services/tauri";
import { applyTheme, readSettings, UPDATE_REMIND_MS, writeSettings, type Settings } from "./settings";

import type { MachineTab } from "../components/layout/MachineSegments";

export type View = "workspace" | "projects" | "processes" | "settings";
export type WorkspaceTab = "dashboard" | "diagnostics" | "cleanup";
export type DiagnosticsFocus = "all" | "error" | "warning" | "pass";

interface AppStateValue {
  view: View;
  setView: (view: View) => void;
  machineTab: MachineTab;
  setMachineTab: (tab: MachineTab) => void;
  openMachineTrends: () => void;
  workspaceTab: WorkspaceTab;
  setWorkspaceTab: (tab: WorkspaceTab) => void;
  inspectorOpen: boolean;
  setInspectorOpen: (open: boolean | ((value: boolean) => boolean)) => void;
  cleanupListedBytes: number | null;
  setCleanupListedBytes: (bytes: number | null) => void;
  artifactFindings: ArtifactFinding[];
  artifactWarnings: string[];
  artifactError: string | null;
  scanProgress: ArtifactScanProgress | null;
  scanDetails: string[];
  desktop: boolean;
  projectPath: string | null;
  scan: ScanResult | null;
  scanOrigin: "live" | "history" | null;
  history: ScanHistoryEntry[];
  cleanupHistory: CleanupHistoryEntry[];
  scanning: boolean;
  scanError: string | null;
  dragging: boolean;
  settings: Settings;
  updateSettings: (settings: Settings) => void;
  dataDirectory: string | null;
  appVersion: string;
  portResult: PortInspection | null;
  inspectingPort: boolean;
  toast: string | null;
  chooseFolder: () => Promise<void>;
  scanCurrent: () => Promise<void>;
  scanFolder: (path: string) => Promise<void>;
  openHistoryEntry: (entry: ScanHistoryEntry) => void;
  inspectPortNumber: (value: string, options?: { openDiagnostics?: boolean }) => Promise<PortInspection | null>;
  diagnosticsFocus: DiagnosticsFocus;
  processesPortQuery: string | null;
  openDiagnosticsTab: (focus?: DiagnosticsFocus) => void;
  openProcessesFindPort: (port: string) => void;
  openProjectInWorkspace: (projectPath: string) => void;
  clearProcessesPortQuery: () => void;
  boundary: FolderLayout | null;
  openedInside: string | null;
  processesNonce: number;
  updateOffer: UpdateCheck | null;
  updateChecking: boolean;
  checkForUpdates: (manual?: boolean) => Promise<void>;
  remindUpdateLater: () => void;
  skipUpdateVersion: () => void;
  downloadUpdate: () => Promise<void>;
  dismissUpdate: () => void;
  copyText: (text: string, message?: string) => Promise<void>;
  openDocs: (url: string) => Promise<void>;
  runConfirmedFix: (suggestion: FixSuggestion) => Promise<FixExecutionResult>;
  removeArtifacts: (relativePaths: string[]) => Promise<void>;
  monitorSettings: MonitorSettings | null;
  monitorStatus: MonitorStatus | null;
  monitorLatest: MonitorSample | null;
  enableMonitoring: () => Promise<void>;
  disableMonitoring: () => Promise<void>;
  saveMonitorSettings: (settings: MonitorSettings) => Promise<void>;
  syncMonitorSamples: (samples: MonitorSample[]) => void;
  monitorAlerts: MonitorAlert[];
  monitorStorageStatus: MonitorStorageStatus | null;
  focusedAlertId: string | null;
  focusMonitorAlert: (alertId: string | null) => void;
  refreshMonitorAlerts: (query?: AlertHistoryQuery) => Promise<void>;
  refreshMonitorStorageStatus: () => Promise<void>;
  clearMonitorHistory: () => Promise<void>;
  dismissMonitorAlert: (alertId: string) => Promise<void>;
  muteMonitorRule: (ruleId: string) => Promise<void>;
  aiSettings: import("../ai/types").AiSettings | null;
  aiKeyStatus: import("../ai/types").AiKeyStatus | null;
  saveAiSettings: (settings: import("../ai/types").AiSettings) => Promise<void>;
  saveAiKey: (apiKey: string) => Promise<void>;
  deleteAiKey: () => Promise<void>;
  testAiConnection: () => Promise<void>;
  runAiDiagnosis: (contextText: string) => Promise<import("../ai/types").AiDiagnosisResponse>;
  aiExplainAvailable: boolean;
  diagnosisSession: DiagnosisSession | null;
  openDiagnosisFromAlert: (alert: MonitorAlert) => void;
  openDiagnosisFromFinding: (finding: DiagnosticFinding) => void;
  openDiagnosisFromArtifact: (item: ArtifactFinding) => void;
  openDiagnosisFromProcess: (input: {
    pid: number;
    name: string;
    command?: string;
    cwd?: string | null;
    cpuPercent?: number;
    memoryBytes?: number;
    tcpPorts?: number[];
    matchedProjectPath?: string | null;
  }) => void;
  closeDiagnosis: () => void;
  updateDiagnosisItems: (items: AiContextItem[]) => void;
  sendDiagnosis: () => Promise<void>;
  recheckDiagnosis: () => Promise<void>;
  stopProcessForDiagnosis: (pid: number) => Promise<void>;
}

const AppStateContext = createContext<AppStateValue | null>(null);

function isCleanupEntry(value: unknown): value is CleanupHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CleanupHistoryEntry>;
  return typeof entry.id === "string" && typeof entry.projectPath === "string" && Array.isArray(entry.paths);
}

function isHistoryEntry(value: unknown): value is ScanHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ScanHistoryEntry>;
  return typeof entry.projectPath === "string" && Array.isArray(entry.findings) && typeof entry.id === "string";
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>("workspace");
  const [machineTab, setMachineTab] = useState<MachineTab>("processes");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("dashboard");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [cleanupListedBytes, setCleanupListedBytes] = useState<number | null>(null);
  const [artifactFindings, setArtifactFindings] = useState<ArtifactFinding[]>([]);
  const [artifactWarnings, setArtifactWarnings] = useState<string[]>([]);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<ArtifactScanProgress | null>(null);
  const [scanDetails, setScanDetails] = useState<string[]>([]);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanOrigin, setScanOrigin] = useState<"live" | "history" | null>(null);
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [cleanupHistory, setCleanupHistory] = useState<CleanupHistoryEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => readSettings());
  const [dataDirectory, setDataDirectory] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState("0.1.0");
  const [portResult, setPortResult] = useState<PortInspection | null>(null);
  const [inspectingPort, setInspectingPort] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [boundary, setBoundary] = useState<FolderLayout | null>(null);
  const [openedInside, setOpenedInside] = useState<string | null>(null);
  const [processesNonce, setProcessesNonce] = useState(0);
  const [updateOffer, setUpdateOffer] = useState<UpdateCheck | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [diagnosticsFocus, setDiagnosticsFocus] = useState<DiagnosticsFocus>("all");
  const [processesPortQuery, setProcessesPortQuery] = useState<string | null>(null);
  const [monitorSettings, setMonitorSettings] = useState<MonitorSettings | null>(null);
  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus | null>(null);
  const [monitorLatest, setMonitorLatest] = useState<MonitorSample | null>(null);
  const [monitorAlerts, setMonitorAlerts] = useState<MonitorAlert[]>([]);
  const [monitorStorageStatus, setMonitorStorageStatus] = useState<MonitorStorageStatus | null>(null);
  const [focusedAlertId, setFocusedAlertId] = useState<string | null>(null);
  const [aiSettings, setAiSettings] = useState<import("../ai/types").AiSettings | null>(null);
  const [aiKeyStatus, setAiKeyStatus] = useState<import("../ai/types").AiKeyStatus | null>(null);
  const [diagnosisSession, setDiagnosisSession] = useState<DiagnosisSession | null>(null);
  const desktop = isTauri();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const historyRef = useRef<ScanHistoryEntry[]>([]);
  historyRef.current = history;
  const scanningRef = useRef(false);

  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [settings.theme]);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    writeSettings(next);
    applyTheme(next.theme);
  }, []);

  const refreshMonitorStatus = useCallback(async () => {
    if (!desktop) return;
    try {
      const status = await fetchMonitorStatus();
      setMonitorStatus(status);
    } catch {
      setMonitorStatus(null);
    }
  }, [desktop]);

  const saveMonitorSettings = useCallback(
    async (next: MonitorSettings) => {
      if (!desktop) return;
      const saved = await monitorSettingsSave(next);
      setMonitorSettings(saved);
      await refreshMonitorStatus();
    },
    [desktop, refreshMonitorStatus],
  );

  const enableMonitoring = useCallback(async () => {
    if (!desktop) return;
    const status = await monitorStart();
    setMonitorStatus(status);
    const settings = await monitorSettingsLoad();
    setMonitorSettings(settings);
    showToast("Monitoring on");
  }, [desktop, showToast]);

  const disableMonitoring = useCallback(async () => {
    if (!desktop) return;
    setMonitorStatus((current) => (current ? { ...current, running: false } : current));
    setMonitorSettings((current) => (current ? { ...current, enabled: false } : current));
    try {
      const status = await monitorStop();
      setMonitorStatus(status);
    } catch {
      await refreshMonitorStatus();
    }
    showToast("Monitoring off");
  }, [desktop, showToast, refreshMonitorStatus]);

  const syncMonitorSamples = useCallback((samples: MonitorSample[]) => {
    const last = samples[samples.length - 1];
    if (last) setMonitorLatest(last);
  }, []);

  const refreshMonitorAlerts = useCallback(async (query?: AlertHistoryQuery) => {
    if (!desktop) return;
    try {
      const next = query ? await monitorAlertsQuery(query) : await monitorAlertsList();
      setMonitorAlerts(next);
    } catch {
      setMonitorAlerts([]);
    }
  }, [desktop]);

  const refreshMonitorStorageStatus = useCallback(async () => {
    if (!desktop) return;
    try {
      setMonitorStorageStatus(await fetchMonitorStorageStatus());
    } catch {
      setMonitorStorageStatus(null);
    }
  }, [desktop]);

  const clearMonitorHistory = useCallback(async () => {
    if (!desktop) return;
    await monitorClearHistory();
    setMonitorAlerts([]);
    setMonitorLatest(null);
    await refreshMonitorStatus();
    await refreshMonitorStorageStatus();
    showToast("Monitoring history cleared");
  }, [desktop, refreshMonitorStatus, refreshMonitorStorageStatus, showToast]);

  const refreshAiKeyStatus = useCallback(async () => {
    if (!desktop) return;
    try {
      setAiKeyStatus(await fetchAiKeyStatus());
    } catch {
      setAiKeyStatus(null);
    }
  }, [desktop]);

  const saveAiSettings = useCallback(
    async (next: import("../ai/types").AiSettings) => {
      if (!desktop) return;
      const saved = await aiSettingsSave(next);
      setAiSettings(saved);
    },
    [desktop],
  );

  const saveAiKey = useCallback(
    async (apiKey: string) => {
      if (!desktop) return;
      setAiKeyStatus(await aiKeySave(apiKey));
      showToast("API key saved to Keychain");
    },
    [desktop, showToast],
  );

  const deleteAiKey = useCallback(async () => {
    if (!desktop) return;
    setAiKeyStatus(await aiKeyDelete());
    showToast("API key removed");
  }, [desktop, showToast]);

  const testAiConnection = useCallback(async () => {
    if (!desktop) return;
    try {
      await aiTestConnection();
      showToast("AI connection OK");
    } catch (cause) {
      showToast(errorMessage(cause));
      throw cause;
    }
  }, [desktop, showToast]);

  const runAiDiagnosis = useCallback(
    async (contextText: string) => {
      if (!desktop) throw new Error("AI diagnosis runs in the desktop app.");
      const response = await aiDiagnose(contextText);
      return response;
    },
    [desktop],
  );

  const aiExplainAvailable = Boolean(aiKeyStatus?.configured);

  const beginDiagnosis = useCallback((session: Omit<DiagnosisSession, "result" | "error" | "sending" | "baselineContext" | "afterContext" | "rechecking">) => {
    setDiagnosisSession({
      ...session,
      result: null,
      error: null,
      sending: false,
      baselineContext: null,
      afterContext: null,
      rechecking: false,
    });
    setInspectorOpen(true);
  }, []);

  const openDiagnosisFromAlert = useCallback(
    (alert: MonitorAlert) => {
      beginDiagnosis({
        sourceKind: "alert",
        sourceId: alert.id,
        sourceLabel: alert.title,
        items: buildAlertContextItems({
          alert,
          latestSample: monitorLatest,
          projectPath,
        }),
        anchors: { projectPath, artifacts: artifactFindings },
      });
    },
    [artifactFindings, beginDiagnosis, monitorLatest, projectPath],
  );

  const openDiagnosisFromFinding = useCallback(
    (finding: DiagnosticFinding) => {
      beginDiagnosis({
        sourceKind: "finding",
        sourceId: finding.id,
        sourceLabel: finding.title,
        items: buildFindingContextItems(finding, projectPath),
        anchors: { projectPath, finding, artifacts: artifactFindings },
      });
    },
    [artifactFindings, beginDiagnosis, projectPath],
  );

  const openDiagnosisFromArtifact = useCallback(
    (item: ArtifactFinding) => {
      beginDiagnosis({
        sourceKind: "artifact",
        sourceId: item.relativePath,
        sourceLabel: item.relativePath,
        items: buildArtifactContextItems(item, projectPath),
        anchors: { projectPath, artifact: item, artifacts: artifactFindings },
      });
    },
    [artifactFindings, beginDiagnosis, projectPath],
  );

  const openDiagnosisFromProcess = useCallback(
    (input: {
      pid: number;
      name: string;
      command?: string;
      cwd?: string | null;
      cpuPercent?: number;
      memoryBytes?: number;
      tcpPorts?: number[];
      matchedProjectPath?: string | null;
    }) => {
      beginDiagnosis({
        sourceKind: "process",
        sourceId: String(input.pid),
        sourceLabel: `${input.name} (PID ${input.pid})`,
        items: buildProcessContextItems({ ...input, projectPath }),
        anchors: {
          projectPath,
          process: {
            pid: input.pid,
            name: input.name,
            command: input.command,
            ports: input.tcpPorts,
          },
        },
      });
    },
    [beginDiagnosis, projectPath],
  );

  const closeDiagnosis = useCallback(() => {
    setDiagnosisSession(null);
  }, []);

  const updateDiagnosisItems = useCallback((items: AiContextItem[]) => {
    setDiagnosisSession((current) => (current ? { ...current, items } : current));
  }, []);

  const sendDiagnosis = useCallback(async () => {
    if (!diagnosisSession || !desktop) return;
    const text = composeContextText(diagnosisSession.items);
    setDiagnosisSession((current) =>
      current ? { ...current, sending: true, error: null } : current,
    );
    try {
      const result = await aiDiagnose(text);
      setDiagnosisSession((current) =>
        current
          ? {
              ...current,
              sending: false,
              result,
              baselineContext: text,
              afterContext: null,
            }
          : current,
      );
    } catch (cause) {
      const message = errorMessage(cause);
      const error =
        typeof cause === "object" && cause && "code" in cause
          ? (cause as import("../ai/types").AiError)
          : { code: "providerMessage" as const, message };
      setDiagnosisSession((current) =>
        current ? { ...current, sending: false, error } : current,
      );
    }
  }, [desktop, diagnosisSession]);

  const rebuildDiagnosisItems = useCallback(
    (session: DiagnosisSession): AiContextItem[] => {
      switch (session.sourceKind) {
        case "alert": {
          const alert = monitorAlerts.find((entry) => entry.id === session.sourceId);
          if (!alert) return session.items;
          return buildAlertContextItems({ alert, latestSample: monitorLatest, projectPath });
        }
        case "finding": {
          const finding = scan?.findings.find((entry) => entry.id === session.sourceId);
          if (!finding) return session.items;
          return buildFindingContextItems(finding, projectPath);
        }
        case "artifact": {
          const item = artifactFindings.find((entry) => entry.relativePath === session.sourceId);
          if (!item) return session.items;
          return buildArtifactContextItems(item, projectPath);
        }
        case "process": {
          const pid = Number(session.sourceId);
          if (!Number.isFinite(pid) || !session.anchors.process) return session.items;
          return buildProcessContextItems({
            ...session.anchors.process,
            pid,
            projectPath,
          });
        }
        default:
          return session.items;
      }
    },
    [artifactFindings, monitorAlerts, monitorLatest, projectPath, scan?.findings],
  );

  const recheckDiagnosis = useCallback(async () => {
    if (!diagnosisSession) return;
    setDiagnosisSession((current) => (current ? { ...current, rechecking: true } : current));
    try {
      if (desktop) {
        await refreshMonitorAlerts();
        setProcessesNonce((value) => value + 1);
      }
      setDiagnosisSession((current) => {
        if (!current) return current;
        const items = rebuildDiagnosisItems(current);
        const afterContext = composeContextText(items);
        return {
          ...current,
          items,
          rechecking: false,
          afterContext,
        };
      });
    } catch {
      setDiagnosisSession((current) => (current ? { ...current, rechecking: false } : current));
    }
  }, [desktop, diagnosisSession, rebuildDiagnosisItems, refreshMonitorAlerts]);

  const stopProcessForDiagnosis = useCallback(
    async (pid: number) => {
      if (!desktop) return;
      await terminateProcess(pid);
      showToast(`Sent stop to PID ${pid}`);
      setProcessesNonce((value) => value + 1);
    },
    [desktop, showToast],
  );

  const openMachineTrends = useCallback(() => {
    setView("processes");
    setMachineTab("trends");
  }, []);

  const focusMonitorAlert = useCallback((alertId: string | null) => {
    setFocusedAlertId(alertId);
    if (alertId) {
      setView("processes");
      setMachineTab("alerts");
    }
  }, []);

  const dismissMonitorAlert = useCallback(
    async (alertId: string) => {
      if (!desktop) return;
      setMonitorAlerts(await monitorAlertDismiss(alertId));
      showToast("Alert dismissed");
    },
    [desktop, showToast],
  );

  const muteMonitorRule = useCallback(
    async (ruleId: string) => {
      if (!desktop) return;
      setMonitorAlerts(await monitorAlertMuteRule(ruleId));
      showToast("Rule muted");
    },
    [desktop, showToast],
  );

  const scanPath = useCallback(
    async (target: string) => {
      if (!desktop) {
        setScanError("Open the Dev Doctor desktop window to scan a local project.");
        return;
      }
      const check = validateProjectPath(target);
      if (!check.ok) {
        setScanError(check.reason);
        return;
      }
      let layout: FolderLayout;
      try {
        layout = await classifyFolder(check.path);
      } catch (error) {
        setScanError(errorMessage(error));
        return;
      }
      if (layout.kind === "boundary") {
        if (scanningRef.current) return;
        setBoundary(layout);
        setOpenedInside(null);
        setProjectPath(layout.canonicalPath);
        setScan(null);
        setScanOrigin(null);
        setCleanupListedBytes(null);
        setArtifactFindings([]);
        setArtifactWarnings([]);
        setArtifactError(null);
        setScanError(null);
        setView("workspace");
        setWorkspaceTab("dashboard");
        return;
      }
      const nested = layout.kind === "nested" ? layout.projects[0] : undefined;
      const destination = nested?.path ?? check.path;
      const destinationCheck = destination === check.path ? check : validateProjectPath(destination);
      if (!destinationCheck.ok) {
        setScanError(destinationCheck.reason);
        return;
      }
      if (scanningRef.current) return;
      scanningRef.current = true;
      const startedAt = Date.now();
      setBoundary(null);
      setOpenedInside(nested?.name ?? null);
      setScanning(true);
      setScanError(null);
      setProjectPath(destinationCheck.path);
      setCleanupListedBytes(null);
      setArtifactFindings([]);
      setArtifactWarnings([]);
      setArtifactError(null);
      setScanDetails(["Checking the toolchain"]);
      setScanProgress({ phase: "environment", detail: "Checking the toolchain", completed: 0, total: null });
      setView("workspace");
      setWorkspaceTab("dashboard");
      try {
        const [snapshotOutcome, artifactOutcome] = await Promise.allSettled([
          collectSnapshot(destinationCheck.path),
          scanArtifacts(destinationCheck.path),
        ]);
        let listedBytes: number | null = null;
        if (artifactOutcome.status === "fulfilled") {
          const listed = classifyArtifacts(artifactOutcome.value.artifacts);
          listedBytes = listed.reduce((sum, row) => sum + (row.countsInTotal ? (row.bytes ?? 0) : 0), 0);
          setArtifactFindings(listed);
          setArtifactWarnings(artifactOutcome.value.warnings);
          setCleanupListedBytes(listedBytes);
        } else {
          setArtifactError(errorMessage(artifactOutcome.reason));
        }
        if (snapshotOutcome.status === "fulfilled") {
          setProjectPath(snapshotOutcome.value.canonicalPath);
          const result = buildScanResult(snapshotOutcome.value);
          const nextHistory = prependHistory(historyRef.current, toHistoryEntry(result, listedBytes));
          historyRef.current = nextHistory;
          setScan(result);
          setScanOrigin("live");
          setHistory(nextHistory);
          try {
            await saveHistory(nextHistory);
          } catch (error) {
            setScanError(`Scan finished, but history could not be saved. ${errorMessage(error)}`);
          }
        } else {
          setScanError(errorMessage(snapshotOutcome.reason));
        }
      } finally {
        const remaining = 3000 - (Date.now() - startedAt);
        if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
        scanningRef.current = false;
        setScanning(false);
      }
    },
    [desktop],
  );

  const chooseFolder = useCallback(async () => {
    if (!desktop) {
      setScanError("Open the Dev Doctor desktop window to choose a folder.");
      return;
    }
    try {
      const selected = await open({ directory: true, multiple: false, title: "Select a project folder" });
      if (typeof selected !== "string") return;
      if (settingsRef.current.scanOnSelect) {
        await scanPath(selected);
        return;
      }
      const check = validateProjectPath(selected);
      if (!check.ok) {
        setScanError(check.reason);
        return;
      }
      setProjectPath(check.path);
      setBoundary(null);
      setOpenedInside(null);
      setScan(null);
      setScanOrigin(null);
      setScanError(null);
      setCleanupListedBytes(null);
      setArtifactFindings([]);
      setArtifactWarnings([]);
      setArtifactError(null);
      setView("workspace");
      setWorkspaceTab("dashboard");
    } catch (error) {
      setScanError(errorMessage(error));
    }
  }, [desktop, scanPath]);

  const scanCurrent = useCallback(async () => {
    if (!projectPath) {
      if (!desktop) {
        setScanError("Open the Dev Doctor desktop window to scan a local project.");
        return;
      }
      try {
        const selected = await open({ directory: true, multiple: false, title: "Select a project folder" });
        if (typeof selected === "string") await scanPath(selected);
      } catch (error) {
        setScanError(errorMessage(error));
      }
      return;
    }
    await scanPath(projectPath);
  }, [desktop, projectPath, scanPath]);

  const openDiagnosticsTab = useCallback((focus: DiagnosticsFocus = "all") => {
    setDiagnosticsFocus(focus);
    setView("workspace");
    setWorkspaceTab("diagnostics");
  }, []);

  const openProcessesFindPort = useCallback((port: string) => {
    setProcessesPortQuery(port.trim());
    setView("processes");
    setMachineTab("processes");
  }, []);

  const clearProcessesPortQuery = useCallback(() => setProcessesPortQuery(null), []);

  const checkForUpdates = useCallback(
    async (manual = false) => {
      if (!desktop) {
        if (manual) showToast("Update check runs in the desktop app.");
        return;
      }
      setUpdateChecking(true);
      try {
        const result = await checkForUpdate();
        if (result.status === "available" && result.latestVersion) {
          const settings = settingsRef.current;
          const skipped = settings.skippedUpdateVersion === result.latestVersion;
          const remindAt = settings.updateRemindAt ? Date.parse(settings.updateRemindAt) : Number.NaN;
          const waiting = Number.isFinite(remindAt) && remindAt > Date.now();
          if (!manual && (skipped || waiting)) return;
          setUpdateOffer(result);
          return;
        }
        setUpdateOffer(null);
        if (manual) showToast(result.message);
      } catch (error) {
        if (manual) showToast(errorMessage(error));
      } finally {
        setUpdateChecking(false);
      }
    },
    [desktop, showToast],
  );

  const remindUpdateLater = useCallback(() => {
    const next = { ...settingsRef.current, updateRemindAt: new Date(Date.now() + UPDATE_REMIND_MS).toISOString() };
    settingsRef.current = next;
    setSettings(next);
    writeSettings(next);
    setUpdateOffer(null);
  }, []);

  const skipUpdateVersion = useCallback(() => {
    const version = updateOffer?.latestVersion;
    if (!version) {
      setUpdateOffer(null);
      return;
    }
    const next = { ...settingsRef.current, skippedUpdateVersion: version, updateRemindAt: null };
    settingsRef.current = next;
    setSettings(next);
    writeSettings(next);
    setUpdateOffer(null);
  }, [updateOffer]);

  const downloadUpdate = useCallback(async () => {
    const url = updateOffer?.url;
    if (!url) return;
    await openAllowedUrl(url);
    setUpdateOffer(null);
  }, [updateOffer]);

  const dismissUpdate = useCallback(() => setUpdateOffer(null), []);

  useEffect(() => {
    if (!desktop) return;
    void checkForUpdates(false);
  }, [desktop, checkForUpdates]);

  useEffect(() => {
    if (!desktop) return;
    let unlisten: (() => void) | undefined;
    let alive = true;
    void listen<string>("menu-action", (event) => {
      if (!alive) return;
      const id = event.payload;
      if (id === "settings") setView("settings");
      if (id === "nav-workspace") setView("workspace");
      if (id === "nav-projects") setView("projects");
      if (id === "nav-processes") setView("processes");
      if (id === "scan-project") void scanCurrent();
      if (id === "refresh-processes") {
        setView("processes");
        setProcessesNonce((nonce) => nonce + 1);
      }
      if (id === "check-updates") void checkForUpdates(true);
    }).then((stop) => {
      if (alive) unlisten = stop;
      else stop();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [desktop, scanCurrent, checkForUpdates]);

  const openHistoryEntry = useCallback((entry: ScanHistoryEntry) => {
    setBoundary(null);
    setOpenedInside(null);
    setProjectPath(entry.projectPath);
    setScan(scanFromHistory(entry));
    setScanOrigin("history");
    setScanError(null);
    setArtifactFindings([]);
    setArtifactWarnings([]);
    setArtifactError(null);
    setCleanupListedBytes(typeof entry.artifactListedBytes === "number" ? entry.artifactListedBytes : null);
    setView("workspace");
    setWorkspaceTab("dashboard");
  }, []);

  const openProjectInWorkspace = useCallback(
    (path: string) => {
      const entry = historyRef.current.find((item) => item.projectPath === path);
      if (entry) {
        openHistoryEntry(entry);
        return;
      }
      const check = validateProjectPath(path);
      if (!check.ok) {
        setScanError(check.reason);
        return;
      }
      setProjectPath(check.path);
      setBoundary(null);
      setOpenedInside(null);
      setScan(null);
      setScanOrigin(null);
      setCleanupListedBytes(null);
      setArtifactFindings([]);
      setArtifactWarnings([]);
      setArtifactError(null);
      setView("workspace");
      setWorkspaceTab("dashboard");
    },
    [openHistoryEntry],
  );

  const removeArtifacts = useCallback(
    async (relativePaths: string[]) => {
      if (!projectPath) throw new Error("Select a folder first.");
      const report = await deleteArtifacts(projectPath, relativePaths);
      if (report.deleted.length === 0) {
        const reason = report.failed[0]?.error ?? "Nothing was deleted.";
        throw new Error(reason);
      }
      const removed = new Set(report.deleted.map((item) => item.relativePath));
      setArtifactFindings((current) => current.filter((item) => !removed.has(item.relativePath)));
      setCleanupListedBytes((current) => Math.max(0, (current ?? 0) - report.reclaimedBytes));
      const record: CleanupHistoryEntry = {
        id: `${Date.now()}`,
        projectPath,
        projectName: projectPath.split("/").filter(Boolean).pop() ?? projectPath,
        cleanedAt: new Date().toISOString(),
        reclaimedBytes: report.reclaimedBytes,
        paths: report.deleted.map((item) => item.relativePath),
      };
      setCleanupHistory((current) => {
        const next = [record, ...current].slice(0, 40);
        void saveCleanupHistory(next).catch((error: unknown) => setScanError(errorMessage(error)));
        return next;
      });
      if (report.failed.length > 0) {
        setScanError(`${report.failed.length} folders were not deleted. ${report.failed[0]?.error ?? ""}`);
      }
    },
    [projectPath],
  );

  const inspectPortNumber = useCallback(
    async (value: string, options?: { openDiagnostics?: boolean }) => {
      const check = validatePort(value);
      if (!check.ok) {
        setScanError(check.reason);
        return null;
      }
      if (!desktop) {
        setScanError("Port inspection runs in the desktop app.");
        return null;
      }
      setInspectingPort(true);
      setScanError(null);
      try {
        const result = await inspectPort(check.port);
        setPortResult(result);
        if (options?.openDiagnostics) {
          setView("workspace");
          setWorkspaceTab("diagnostics");
        }
        return result;
      } catch (error) {
        setScanError(errorMessage(error));
        return null;
      } finally {
        setInspectingPort(false);
      }
    },
    [desktop],
  );

  const copyText = useCallback(
    async (text: string, message = "Copied") => {
      await navigator.clipboard.writeText(text);
      showToast(message);
    },
    [showToast],
  );

  const openDocs = useCallback(async (url: string) => {
    if (!desktop) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    await openAllowedUrl(url);
  }, [desktop]);

  const runConfirmedFix = useCallback(
    async (suggestion: FixSuggestion) => {
      if (!projectPath || suggestion.kind !== "execute" || !suggestion.action) {
        throw new Error("This fix cannot be executed.");
      }
      const check = validateFixRequest(suggestion.action, projectPath);
      if (!check.ok) throw new Error(check.reason);
      const result = await executeFix(suggestion.action, projectPath);
      if (result.ok) await scanPath(projectPath);
      return result;
    },
    [projectPath, scanPath],
  );

  useEffect(() => {
    if (!desktop) return;
    void appMetadata()
      .then((metadata) => {
        setAppVersion(metadata.version);
        setDataDirectory(metadata.dataDirectory);
      })
      .catch((error: unknown) => setScanError(errorMessage(error)));
    void loadHistory()
      .then((entries) => setHistory(entries.filter(isHistoryEntry)))
      .catch((error: unknown) => setScanError(errorMessage(error)));
    void loadCleanupHistory()
      .then((entries) => setCleanupHistory(entries.filter(isCleanupEntry)))
      .catch(() => setCleanupHistory([]));
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    let unlisten: (() => void) | undefined;
    let active = true;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "leave") {
          setDragging(false);
          return;
        }
        if (event.payload.type === "drop") {
          setDragging(false);
          const dropped = event.payload.paths[0];
          if (!dropped) return;
          if (settingsRef.current.scanOnSelect) {
            void scanPath(dropped);
            return;
          }
          const check = validateProjectPath(dropped);
          if (!check.ok) {
            setScanError(check.reason);
            return;
          }
          setProjectPath(check.path);
          setBoundary(null);
          setOpenedInside(null);
          setScan(null);
          setScanOrigin(null);
          setCleanupListedBytes(null);
          setArtifactFindings([]);
          setArtifactWarnings([]);
          setArtifactError(null);
          setView("workspace");
          setWorkspaceTab("dashboard");
          return;
        }
        setDragging(true);
      })
      .then((stop) => {
        if (active) unlisten = stop;
        else stop();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unlisten?.();
    };
  }, [desktop, scanPath]);

  useEffect(() => {
    if (!desktop) return;
    let unlisten: (() => void) | undefined;
    let alive = true;
    void listen<ArtifactScanProgress>("artifact-scan-progress", (event) => {
      if (!alive || !scanningRef.current) return;
      setScanProgress(event.payload);
      setScanDetails((current) => {
        const line = event.payload.detail;
        if (!line || current[current.length - 1] === line) return current;
        return [...current, line].slice(-6);
      });
    }).then((stop) => {
      if (alive) unlisten = stop;
      else stop();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    let alive = true;
    void monitorSettingsLoad()
      .then((settings) => {
        if (alive) setMonitorSettings(settings);
      })
      .catch(() => {
        if (alive) setMonitorSettings(null);
      });
    void refreshMonitorStatus();
    void refreshMonitorAlerts();
    void refreshMonitorStorageStatus();
    void aiSettingsLoad()
      .then((settings) => {
        if (alive) setAiSettings(settings);
      })
      .catch(() => {
        if (alive) setAiSettings(null);
      });
    void refreshAiKeyStatus();
    return () => {
      alive = false;
    };
  }, [desktop, refreshMonitorStatus, refreshMonitorAlerts, refreshMonitorStorageStatus, refreshAiKeyStatus]);

  useEffect(() => {
    if (!desktop) return;
    let unlisten: (() => void) | undefined;
    let alive = true;
    void listen<MonitorSample>("monitor-sample", (event) => {
      if (!alive) return;
      const tick = event.payload;
      setMonitorLatest(tick);
      setMonitorStatus((current) =>
        current?.running
          ? { ...current, lastAtMs: tick.atMs }
          : current,
      );
    }).then((stop) => {
      if (alive) unlisten = stop;
      else stop();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    let unlisten: (() => void) | undefined;
    let alive = true;
    void listen<MonitorAlertEvent>("monitor-alert", (event) => {
      if (!alive) return;
      setMonitorAlerts((current) => {
        const next = event.payload.alert;
        const without = current.filter((row) => row.id !== next.id);
        return [...without, next].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      });
      if (event.payload.kind === "fired") {
        setFocusedAlertId(event.payload.alert.id);
        setView("processes");
        setMachineTab("alerts");
      }
    }).then((stop) => {
      if (alive) unlisten = stop;
      else stop();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    let listener: { unregister: () => Promise<void> } | undefined;
    void import("@tauri-apps/plugin-notification")
      .then(({ onAction }) =>
        onAction(() => {
          setView("processes");
          setMachineTab("alerts");
        }),
      )
      .then((handle) => {
        listener = handle;
      })
      .catch(() => undefined);
    return () => {
      void listener?.unregister();
    };
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    let unlisten: (() => void) | undefined;
    let alive = true;
    void listen<string>("monitor-alert-focus", (event) => {
      if (!alive) return;
      focusMonitorAlert(event.payload);
    }).then((stop) => {
      if (alive) unlisten = stop;
      else stop();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [desktop, focusMonitorAlert]);

  const value = useMemo<AppStateValue>(
    () => ({
      view,
      setView,
      machineTab,
      setMachineTab,
      openMachineTrends,
      workspaceTab,
      setWorkspaceTab,
      inspectorOpen,
      setInspectorOpen,
      cleanupListedBytes,
      setCleanupListedBytes,
      artifactFindings,
      artifactWarnings,
      artifactError,
      scanProgress,
      scanDetails,
      desktop,
      projectPath,
      scan,
      scanOrigin,
      history,
      cleanupHistory,
      scanning,
      scanError,
      dragging,
      settings,
      updateSettings,
      dataDirectory,
      appVersion,
      portResult,
      inspectingPort,
      toast,
      chooseFolder,
      scanCurrent,
      scanFolder: scanPath,
      openHistoryEntry,
      inspectPortNumber,
      diagnosticsFocus,
      processesPortQuery,
      openDiagnosticsTab,
      openProcessesFindPort,
      openProjectInWorkspace,
      clearProcessesPortQuery,
      boundary,
      openedInside,
      processesNonce,
      updateOffer,
      updateChecking,
      checkForUpdates,
      remindUpdateLater,
      skipUpdateVersion,
      downloadUpdate,
      dismissUpdate,
      copyText,
      openDocs,
      runConfirmedFix,
      removeArtifacts,
      monitorSettings,
      monitorStatus,
      monitorLatest,
      enableMonitoring,
      disableMonitoring,
      saveMonitorSettings,
      syncMonitorSamples,
      monitorAlerts,
      monitorStorageStatus,
      refreshMonitorStorageStatus,
      clearMonitorHistory,
      focusedAlertId,
      focusMonitorAlert,
      refreshMonitorAlerts,
      dismissMonitorAlert,
      muteMonitorRule,
      aiSettings,
      aiKeyStatus,
      saveAiSettings,
      saveAiKey,
      deleteAiKey,
      testAiConnection,
      runAiDiagnosis,
      aiExplainAvailable,
      diagnosisSession,
      openDiagnosisFromAlert,
      openDiagnosisFromFinding,
      openDiagnosisFromArtifact,
      openDiagnosisFromProcess,
      closeDiagnosis,
      updateDiagnosisItems,
      sendDiagnosis,
      recheckDiagnosis,
      stopProcessForDiagnosis,
    }),
    [
      view,
      machineTab,
      openMachineTrends,
      workspaceTab,
      inspectorOpen,
      cleanupListedBytes,
      artifactFindings,
      artifactWarnings,
      artifactError,
      scanProgress,
      scanDetails,
      desktop,
      projectPath,
      scan,
      scanOrigin,
      history,
      cleanupHistory,
      scanning,
      scanError,
      dragging,
      settings,
      updateSettings,
      dataDirectory,
      appVersion,
      portResult,
      inspectingPort,
      toast,
      chooseFolder,
      scanCurrent,
      scanPath,
      openHistoryEntry,
      inspectPortNumber,
      diagnosticsFocus,
      processesPortQuery,
      openDiagnosticsTab,
      openProcessesFindPort,
      openProjectInWorkspace,
      clearProcessesPortQuery,
      boundary,
      openedInside,
      processesNonce,
      updateOffer,
      updateChecking,
      checkForUpdates,
      remindUpdateLater,
      skipUpdateVersion,
      downloadUpdate,
      dismissUpdate,
      copyText,
      openDocs,
      runConfirmedFix,
      removeArtifacts,
      monitorSettings,
      monitorStatus,
      monitorLatest,
      enableMonitoring,
      disableMonitoring,
      saveMonitorSettings,
      syncMonitorSamples,
      monitorAlerts,
      monitorStorageStatus,
      refreshMonitorStorageStatus,
      clearMonitorHistory,
      focusedAlertId,
      focusMonitorAlert,
      refreshMonitorAlerts,
      refreshMonitorStorageStatus,
      clearMonitorHistory,
      dismissMonitorAlert,
      muteMonitorRule,
      monitorStorageStatus,
      refreshMonitorStorageStatus,
      clearMonitorHistory,
      aiSettings,
      aiKeyStatus,
      saveAiSettings,
      saveAiKey,
      deleteAiKey,
      testAiConnection,
      runAiDiagnosis,
      aiExplainAvailable,
      diagnosisSession,
      openDiagnosisFromAlert,
      openDiagnosisFromFinding,
      openDiagnosisFromArtifact,
      openDiagnosisFromProcess,
      closeDiagnosis,
      updateDiagnosisItems,
      sendDiagnosis,
      recheckDiagnosis,
      stopProcessForDiagnosis,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) throw new Error("useAppState must be used inside AppStateProvider");
  return value;
}
