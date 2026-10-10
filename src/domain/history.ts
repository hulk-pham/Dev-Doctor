import type { ScanHistoryEntry, ScanResult } from "./types";

export const HISTORY_LIMIT = 40;

export function toHistoryEntry(scan: ScanResult, artifactListedBytes: number | null = null): ScanHistoryEntry {
  return {
    id: scan.id,
    projectName: scan.project.name,
    projectPath: scan.project.path,
    scannedAt: scan.scannedAt,
    errorCount: scan.summary.errors,
    warningCount: scan.summary.warnings,
    infoCount: scan.summary.infos,
    passedCount: scan.summary.passed,
    health: scan.health,
    findings: scan.findings,
    meta: scan.meta,
    projectType: scan.project.projectType,
    artifactListedBytes,
  };
}

export function scanFromHistory(entry: ScanHistoryEntry): ScanResult {
  return {
    id: entry.id,
    project: {
      name: entry.projectName,
      path: entry.projectPath,
      projectType: entry.projectType,
    },
    scannedAt: entry.scannedAt,
    findings: entry.findings,
    summary: {
      passed: entry.passedCount,
      warnings: entry.warningCount,
      errors: entry.errorCount,
      infos: entry.infoCount,
    },
    health: entry.health,
    meta: entry.meta,
  };
}

export function prependHistory(entries: ScanHistoryEntry[], next: ScanHistoryEntry): ScanHistoryEntry[] {
  return [next, ...entries.filter((entry) => entry.id !== next.id)].slice(0, HISTORY_LIMIT);
}
