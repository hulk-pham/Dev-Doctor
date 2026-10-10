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

export function appMetadata(): Promise<AppMetadata> {
  return invoke("app_metadata");
}

export function sampleFixturePath(): Promise<string | null> {
  return invoke("sample_fixture_path");
}
