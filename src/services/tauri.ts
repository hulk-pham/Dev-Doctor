import { invoke } from "@tauri-apps/api/core";
import type {
  AppMetadata,
  FixExecutionResult,
  PortInspection,
  ProjectSnapshot,
  ScanHistoryEntry,
} from "../domain/types";

export function collectSnapshot(projectPath: string): Promise<ProjectSnapshot> {
  return invoke("collect_snapshot", { projectPath });
}

export function inspectPort(port: number): Promise<PortInspection> {
  return invoke("inspect_port", { port });
}

export function executeFix(action: string, projectPath: string): Promise<FixExecutionResult> {
  return invoke("execute_fix", { action, projectPath });
}

export function openAllowedUrl(url: string): Promise<void> {
  return invoke("open_allowed_url", { url });
}

export function loadHistory(): Promise<ScanHistoryEntry[]> {
  return invoke("load_history");
}

export function saveHistory(entries: ScanHistoryEntry[]): Promise<void> {
  return invoke("save_history", { entries });
}

export function loadCleanupHistory(): Promise<import("../domain/types").CleanupHistoryEntry[]> {
  return invoke("load_cleanup_history");
}

export function saveCleanupHistory(entries: import("../domain/types").CleanupHistoryEntry[]): Promise<void> {
  return invoke("save_cleanup_history", { entries });
}

export interface DeleteReport {
  deleted: Array<{ relativePath: string; bytes: number }>;
  failed: Array<{ relativePath: string; error: string }>;
  reclaimedBytes: number;
}

export function deleteArtifacts(projectPath: string, relativePaths: string[]): Promise<DeleteReport> {
  return invoke("delete_artifacts", { projectPath, relativePaths });
}

export interface ProcessInfo {
  pid: number;
  ppid: number;
  cpuPercent: number;
  memoryBytes: number;
  elapsed: string;
  name: string;
  command: string;
  cwd: string | null;
  tcpPorts: number[];
  development: boolean;
  observedHighCpu: boolean;
  observedHighMemory: boolean;
}

export function listProcesses(includeAll = false): Promise<ProcessInfo[]> {
  return invoke("list_processes", { includeAll });
}

export function terminateProcess(pid: number): Promise<void> {
  return invoke("terminate_process", { pid });
}

export function appMetadata(): Promise<AppMetadata> {
  return invoke("app_metadata");
}

export interface ChromeButton {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowChrome {
  buttons: ChromeButton[];
  contentHeight: number;
}

export function windowChrome(): Promise<WindowChrome> {
  return invoke("window_chrome");
}

export interface ArtifactScanProgress {
  phase: string;
  detail: string;
  completed: number;
  total: number | null;
}

export interface ArtifactScan {
  projectPath: string;
  artifacts: import("../diagnostics/artifacts").RawArtifact[];
  warnings: string[];
}

export function scanArtifacts(projectPath: string): Promise<ArtifactScan> {
  return invoke("scan_artifacts", { projectPath });
}
