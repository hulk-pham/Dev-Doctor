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
import type { CleanupHistoryEntry, FixExecutionResult, FixSuggestion, PortInspection, ScanHistoryEntry, ScanResult } from "../domain/types";
import { classifyArtifacts, type ArtifactFinding } from "../diagnostics/artifacts";
import { buildScanResult } from "../diagnostics/engine";
import { validateFixRequest, validateProjectPath } from "../diagnostics/paths";
import { validatePort } from "../diagnostics/ports";
import { errorMessage } from "../lib/utils";
import { appMetadata, collectSnapshot, deleteArtifacts, executeFix, inspectPort, loadCleanupHistory, loadHistory, openAllowedUrl, saveCleanupHistory, saveHistory, scanArtifacts, type ArtifactScanProgress } from "../services/tauri";
import { applyTheme, readSettings, writeSettings, type Settings } from "./settings";

export type View = "workspace" | "projects" | "processes" | "settings";
export type WorkspaceTab = "dashboard" | "diagnostics" | "cleanup";
export type DiagnosticsFocus = "all" | "error" | "warning" | "pass";

interface AppStateValue {
  view: View;
  setView: (view: View) => void;
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
  openHistoryEntry: (entry: ScanHistoryEntry) => void;
  inspectPortNumber: (value: string, options?: { openDiagnostics?: boolean }) => Promise<PortInspection | null>;
  diagnosticsFocus: DiagnosticsFocus;
  processesPortQuery: string | null;
  openDiagnosticsTab: (focus?: DiagnosticsFocus) => void;
  openProcessesFindPort: (port: string) => void;
  openProjectInWorkspace: (projectPath: string) => void;
  clearProcessesPortQuery: () => void;
  copyText: (text: string, message?: string) => Promise<void>;
  openDocs: (url: string) => Promise<void>;
  runConfirmedFix: (suggestion: FixSuggestion) => Promise<FixExecutionResult>;
  removeArtifacts: (relativePaths: string[]) => Promise<void>;
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
  const [diagnosticsFocus, setDiagnosticsFocus] = useState<DiagnosticsFocus>("all");
  const [processesPortQuery, setProcessesPortQuery] = useState<string | null>(null);
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
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 2400);
  }, []);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    writeSettings(next);
    applyTheme(next.theme);
  }, []);

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
      if (scanningRef.current) return;
      scanningRef.current = true;
      const startedAt = Date.now();
      setScanning(true);
      setScanError(null);
      setProjectPath(check.path);
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
          collectSnapshot(check.path),
          scanArtifacts(check.path),
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
  }, []);

  const clearProcessesPortQuery = useCallback(() => setProcessesPortQuery(null), []);

  const openHistoryEntry = useCallback((entry: ScanHistoryEntry) => {
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

  const value = useMemo<AppStateValue>(
    () => ({
      view,
      setView,
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
      openHistoryEntry,
      inspectPortNumber,
      diagnosticsFocus,
      processesPortQuery,
      openDiagnosticsTab,
      openProcessesFindPort,
      openProjectInWorkspace,
      clearProcessesPortQuery,
      copyText,
      openDocs,
      runConfirmedFix,
      removeArtifacts,
    }),
    [
      view,
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
      openHistoryEntry,
      inspectPortNumber,
      diagnosticsFocus,
      processesPortQuery,
      openDiagnosticsTab,
      openProcessesFindPort,
      openProjectInWorkspace,
      clearProcessesPortQuery,
      copyText,
      openDocs,
      runConfirmedFix,
      removeArtifacts,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) throw new Error("useAppState must be used inside AppStateProvider");
  return value;
}
