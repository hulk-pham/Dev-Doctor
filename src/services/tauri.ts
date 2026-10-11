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

export interface ChildProject {
  name: string;
  path: string;
  ecosystem: string;
}

export interface FolderLayout {
  kind: "source" | "nested" | "boundary" | "not-source";
  canonicalPath: string;
  ecosystem: string | null;
  projects: ChildProject[];
  truncated: boolean;
}

export function classifyFolder(projectPath: string): Promise<FolderLayout> {
  return invoke("classify_folder", { projectPath });
}

export interface UpdateCheck {
  status: "available" | "current" | "none" | "unavailable";
  currentVersion: string;
  latestVersion: string | null;
  url: string | null;
  notes: string | null;
  message: string;
}

export function checkForUpdate(): Promise<UpdateCheck> {
  return invoke("check_for_update");
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

export function monitorSettingsLoad(): Promise<import("../domain/types").MonitorSettings> {
  return invoke("monitor_settings_load");
}

export function monitorSettingsSave(settings: import("../domain/types").MonitorSettings): Promise<import("../domain/types").MonitorSettings> {
  return invoke("monitor_settings_save", { settings });
}

export function monitorStart(): Promise<import("../domain/types").MonitorStatus> {
  return invoke("monitor_start");
}

export function monitorStop(): Promise<import("../domain/types").MonitorStatus> {
  return invoke("monitor_stop");
}

export function monitorStatus(): Promise<import("../domain/types").MonitorStatus> {
  return invoke("monitor_status");
}

export function monitorRecent(range: string): Promise<import("../domain/types").MonitorSample[]> {
  return invoke("monitor_recent", { range });
}

export function monitorAlertsList(): Promise<import("../domain/types").MonitorAlert[]> {
  return invoke("monitor_alerts_list");
}

export function monitorAlertDismiss(alertId: string): Promise<import("../domain/types").MonitorAlert[]> {
  return invoke("monitor_alert_dismiss", { alertId });
}

export function monitorAlertMuteRule(ruleId: string): Promise<import("../domain/types").MonitorAlert[]> {
  return invoke("monitor_alert_mute_rule", { ruleId });
}

export function monitorAlertsQuery(
  query: import("../domain/types").AlertHistoryQuery,
): Promise<import("../domain/types").MonitorAlert[]> {
  return invoke("monitor_alerts_query", { query });
}

export function monitorStorageStatus(): Promise<import("../domain/types").MonitorStorageStatus> {
  return invoke("monitor_storage_status");
}

export function monitorClearHistory(): Promise<void> {
  return invoke("monitor_clear_history");
}

export function aiSettingsLoad(): Promise<import("../ai/types").AiSettings> {
  return invoke("ai_settings_load");
}

export function aiSettingsSave(settings: import("../ai/types").AiSettings): Promise<import("../ai/types").AiSettings> {
  return invoke("ai_settings_save", { settings });
}

export function aiKeyStatus(): Promise<import("../ai/types").AiKeyStatus> {
  return invoke("ai_key_status");
}

export function aiKeySave(apiKey: string): Promise<import("../ai/types").AiKeyStatus> {
  return invoke("ai_key_save", { apiKey });
}

export function aiKeyDelete(): Promise<import("../ai/types").AiKeyStatus> {
  return invoke("ai_key_delete");
}

export function aiTestConnection(): Promise<void> {
  return invoke("ai_test_connection");
}

export function aiDiagnose(contextText: string): Promise<import("../ai/types").AiDiagnosisResponse> {
  return invoke("ai_diagnose", { contextText });
}

export function aiChat(messages: Array<{ role: string; content: string }>): Promise<string> {
  return invoke("ai_chat", { messages });
}

export function aiCancelInflight(): Promise<void> {
  return invoke("ai_cancel_inflight");
}

export function aiChatStoreLoad(scope: string): Promise<string | null> {
  return invoke("ai_chat_store_load", { scope });
}

export function aiChatStoreSave(scope: string, json: string): Promise<void> {
  return invoke("ai_chat_store_save", { scope, json });
}
