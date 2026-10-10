import type { FixActionId, FixSuggestion } from "../domain/types";
import { validateFixRequest } from "./paths";

export interface ExecutableCommand {
  command: string;
  args: readonly string[];
}

export interface FixPreview {
  requiresConfirmation: boolean;
  executable: boolean;
  title: string;
  whatChanges: string;
  operation: string;
  workingDirectory: string;
  sideEffects: string;
  blockedReason?: string;
}

/** Canonical install commands. The Rust allowlist must use the same argv. */
export function executableCommand(action: FixActionId): ExecutableCommand {
  if (action === "pnpm-install") {
    return { command: "pnpm install --ignore-scripts", args: ["install", "--ignore-scripts"] };
  }
  return { command: "npm install --ignore-scripts", args: ["install", "--ignore-scripts"] };
}

export function confirmationRequired(suggestion: FixSuggestion): boolean {
  return suggestion.kind === "execute";
}

export function buildFixPreview(suggestion: FixSuggestion, projectPath: string): FixPreview {
  if (suggestion.kind === "copy") {
    return {
      requiresConfirmation: false,
      executable: false,
      title: suggestion.label,
      whatChanges: "Nothing on disk. The text is copied to the clipboard.",
      operation: suggestion.commandText ?? "",
      workingDirectory: projectPath,
      sideEffects: "You can review and run the command yourself.",
    };
  }

  if (suggestion.kind === "open-url") {
    return {
      requiresConfirmation: false,
      executable: false,
      title: suggestion.label,
      whatChanges: "Opens an allowlisted documentation page in your browser.",
      operation: suggestion.url ?? "",
      workingDirectory: projectPath,
      sideEffects: "No project files are modified.",
    };
  }

  const action = suggestion.action;
  const command = action === "npm-install" || action === "pnpm-install" ? executableCommand(action) : null;
  const operation = command?.command ?? "";
  const check = validateFixRequest(action ?? "", projectPath);
  if (!command || !check.ok) {
    const blockedReason = !check.ok ? check.reason : "This action is not allowlisted.";
    return {
      requiresConfirmation: true,
      executable: false,
      title: suggestion.label,
      whatChanges: suggestion.whatChanges,
      operation,
      workingDirectory: projectPath,
      sideEffects: suggestion.sideEffects,
      blockedReason,
    };
  }

  return {
    requiresConfirmation: true,
    executable: true,
    title: suggestion.label,
    whatChanges: suggestion.whatChanges,
    operation,
    workingDirectory: projectPath,
    sideEffects: suggestion.sideEffects,
  };
}
