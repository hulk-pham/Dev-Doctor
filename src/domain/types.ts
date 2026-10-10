export type DiagnosticSeverity = "error" | "warning" | "info";

export type DiagnosticCategory =
  | "runtime"
  | "dependencies"
  | "configuration"
  | "git"
  | "ports";

export type DiagnosticStatus = "pass" | "fail" | "unknown";

export type FixKind = "execute" | "copy" | "open-url";

export type FixActionId = "npm-install" | "pnpm-install";

export type Health = "healthy" | "attention" | "unhealthy";

export interface FixSuggestion {
  id: string;
  label: string;
  kind: FixKind;
  action?: FixActionId;
  commandText?: string;
  url?: string;
  whatChanges: string;
  sideEffects: string;
}

export interface DiagnosticFinding {
  id: string;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  status: DiagnosticStatus;
  title: string;
  explanation: string;
  evidence: string[];
  recommendedAction: string;
  fix?: FixSuggestion;
}

export interface Project {
  name: string;
  path: string;
  projectType: string;
}

export type DependencyInstallStatus = "yes" | "no" | "partial" | "unknown";

export interface ProjectMeta {
  packageManager: string;
  packageManagerVersion: string | null;
  nodeVersion: string | null;
  enginesNode: string | null;
  gitBranch: string | null;
  gitDirty: boolean | null;
  gitRepo: boolean;
  dependenciesInstalled: DependencyInstallStatus;
  nodeModulesExists: boolean;
  isSample: boolean;
}

export interface ScanSummary {
  passed: number;
  warnings: number;
  errors: number;
  infos: number;
}

export interface ScanResult {
  id: string;
  project: Project;
  scannedAt: string;
  findings: DiagnosticFinding[];
  summary: ScanSummary;
  health: Health;
  meta: ProjectMeta;
}

export interface ScanHistoryEntry {
  id: string;
  projectName: string;
  projectPath: string;
  scannedAt: string;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  passedCount: number;
  health: Health;
  findings: DiagnosticFinding[];
  meta: ProjectMeta;
  projectType: string;
}

export interface ToolProbe {
  available: boolean;
  version: string | null;
  error: string | null;
}

export interface PackageJsonSnapshot {
  present: boolean;
  parseError: string | null;
  readError: string | null;
  name: string | null;
  enginesNode: string | null;
  enginesNodeError: string | null;
  dependencyNames: string[];
  devDependencyNames: string[];
}

export interface EnvSnapshot {
  exampleFile: string | null;
  exampleKeys: string[];
  exampleReadError: string | null;
  exampleUnparsedLines: number;
  envFileExists: boolean;
  envKeys: string[];
  envReadError: string | null;
  envUnparsedLines: number;
  note: string | null;
}

export interface GitSnapshot {
  gitAvailable: boolean;
  isRepo: boolean;
  branch: string | null;
  porcelain: string | null;
  porcelainTruncated: boolean;
  error: string | null;
}

export interface ProjectSnapshot {
  canonicalPath: string;
  folderName: string;
  packageJson: PackageJsonSnapshot;
  lockfiles: string[];
  nodeModulesExists: boolean;
  missingDependencyNames: string[];
  dependencyCheckNote: string | null;
  env: EnvSnapshot;
  git: GitSnapshot;
  node: ToolProbe;
  npm: ToolProbe;
  pnpm: ToolProbe;
  isSample: boolean;
}

export interface PortInspection {
  port: number;
  listening: boolean;
  pid: number | null;
  processName: string | null;
  listenerCount: number;
  error: string | null;
}

export interface FixExecutionResult {
  ok: boolean;
  command: string;
  exitCode: number | null;
  outputTail: string;
  error: string | null;
}

export interface AppMetadata {
  version: string;
  dataDirectory: string;
}

export const CATEGORY_LABELS: Record<DiagnosticCategory, string> = {
  runtime: "Runtime & Tooling",
  dependencies: "Dependencies",
  configuration: "Project Configuration",
  git: "Git",
  ports: "Ports & Processes",
};

export const CATEGORY_ORDER: DiagnosticCategory[] = [
  "runtime",
  "dependencies",
  "configuration",
  "git",
  "ports",
];

export const DOCS = {
  nodeDownload: "https://nodejs.org/en/download",
  nodeEngines: "https://nodejs.org/api/packages.html#engines",
  npmInstall: "https://docs.npmjs.com/cli/commands/npm-install",
  pnpmInstall: "https://pnpm.io/installation",
  gitDownload: "https://git-scm.com/downloads",
} as const;
