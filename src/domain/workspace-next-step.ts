import type { ScanResult } from "./types";

export type WorkspaceNextKind = "errors" | "warnings" | "cleanup" | "clear" | "scan";

export interface WorkspaceNextStep {
  kind: WorkspaceNextKind;
  message: string;
  actionLabel: string;
}

const CLEANUP_HINT_BYTES = 100 * 1024 * 1024;

export function workspaceNextStep(
  scan: ScanResult | null,
  cleanupListedBytes: number | null,
  hasProject: boolean,
): WorkspaceNextStep {
  if (!hasProject) {
    return {
      kind: "scan",
      message: "Choose a project folder to begin.",
      actionLabel: "Select folder",
    };
  }
  if (!scan) {
    return {
      kind: "scan",
      message: "Run a scan to see diagnostics and folder sizes together.",
      actionLabel: "Scan project",
    };
  }
  const { errors, warnings } = scan.summary;
  if (errors > 0) {
    return {
      kind: "errors",
      message: `${errors} ${errors === 1 ? "error" : "errors"} may block this project from running.`,
      actionLabel: "Review errors",
    };
  }
  if (cleanupListedBytes != null && cleanupListedBytes >= CLEANUP_HINT_BYTES) {
    return {
      kind: "cleanup",
      message: "A large amount of generated or reproducible folders was measured.",
      actionLabel: "Review cleanup",
    };
  }
  if (warnings > 0) {
    return {
      kind: "warnings",
      message: `${warnings} ${warnings === 1 ? "warning" : "warnings"} are worth a look.`,
      actionLabel: "Review warnings",
    };
  }
  return {
    kind: "clear",
    message: "No blocking errors in the last scan.",
    actionLabel: "View diagnostics",
  };
}
