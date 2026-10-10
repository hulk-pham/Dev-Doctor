import type { DiagnosticFinding } from "../domain/types";
import { cn } from "./utils";

export type FindingTone = "pass" | "error" | "warning" | "info";

export function findingTone(finding: DiagnosticFinding): FindingTone {
  if (finding.status === "pass") return "pass";
  if (finding.severity === "error") return "error";
  if (finding.severity === "warning") return "warning";
  return "info";
}

/** Row accent — severity must be obvious before reading the badge. */
export function findingRowAccent(tone: FindingTone): string {
  return cn(
    "border-l-[3px]",
    tone === "error" && "border-l-danger bg-danger/[0.07]",
    tone === "warning" && "border-l-warning bg-warning/[0.08]",
    tone === "pass" && "border-l-success bg-success/[0.06]",
    tone === "info" && "border-l-info bg-info/[0.06]",
  );
}
