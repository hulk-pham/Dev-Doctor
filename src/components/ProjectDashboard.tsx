import type { ProjectMeta, ScanResult } from "../domain/types";
import { formatWhen } from "../lib/utils";
import { Badge } from "./ui/badge";

function installLabel(status: ProjectMeta["dependenciesInstalled"]): string {
  if (status === "yes") return "Installed";
  if (status === "no") return "Not installed";
  if (status === "partial") return "Partially installed";
  return "Unknown";
}

function healthTone(health: ScanResult["health"]): "pass" | "warning" | "error" {
  if (health === "healthy") return "pass";
  if (health === "attention") return "warning";
  return "error";
}

function healthLabel(health: ScanResult["health"]): string {
  if (health === "healthy") return "Healthy";
  if (health === "attention") return "Needs attention";
  return "Unhealthy";
}

export function ProjectDashboard({ scan }: { scan: ScanResult }) {
  const rows = [
    ["Project type", scan.project.projectType],
    ["Path", scan.project.path],
    ["Git branch", scan.meta.gitRepo ? (scan.meta.gitBranch ?? "Unknown") : "Not a repository"],
    ["Working tree", scan.meta.gitDirty == null ? "Unknown" : scan.meta.gitDirty ? "Uncommitted changes" : "Clean"],
    ["Node.js", scan.meta.nodeVersion ?? "Not detected"],
    ["engines.node", scan.meta.enginesNode ?? "Not declared"],
    ["Package manager", scan.meta.packageManagerVersion ? `${scan.meta.packageManager} ${scan.meta.packageManagerVersion}` : scan.meta.packageManager],
    ["Dependencies", installLabel(scan.meta.dependenciesInstalled)],
    ["Last scan", formatWhen(scan.scannedAt)],
  ];

  return (
    <section className="rounded-xl border border-border bg-panel">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{scan.project.name}</h2>
          <p className="truncate font-mono text-xs text-muted">{scan.project.path}</p>
        </div>
        <Badge tone={healthTone(scan.health)}>{healthLabel(scan.health)}</Badge>
      </div>
      <dl className="grid gap-px bg-border sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="bg-panel px-4 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
            <dd className="mt-1 break-all text-sm">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
