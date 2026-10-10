import { Copy, ExternalLink, Wrench } from "lucide-react";
import type { DiagnosticFinding } from "../domain/types";
import { statusLabel } from "../diagnostics/engine";
import { useAppState } from "../state/AppState";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

function toneFor(finding: DiagnosticFinding): "pass" | "error" | "warning" | "info" {
  if (finding.status === "pass") return "pass";
  if (finding.severity === "error") return "error";
  if (finding.severity === "warning") return "warning";
  return "info";
}

function accent(finding: DiagnosticFinding): string {
  if (finding.status === "pass") return "border-l-success";
  if (finding.severity === "error") return "border-l-danger";
  if (finding.severity === "warning") return "border-l-warning";
  return "border-l-info";
}

export function formatFinding(finding: DiagnosticFinding): string {
  return [
    `${finding.severity.toUpperCase()}: ${finding.title}`,
    finding.explanation,
    "",
    "Evidence:",
    ...(finding.evidence.length ? finding.evidence.map((line) => `- ${line}`) : ["- None"]),
    "",
    "Recommended action:",
    finding.recommendedAction,
  ].join("\n");
}

export function FindingCard({
  finding,
  onExecute,
}: {
  finding: DiagnosticFinding;
  onExecute: (finding: DiagnosticFinding) => void;
}) {
  const { copyText, openDocs } = useAppState();
  const fix = finding.fix;

  return (
    <article className={`rounded-xl border border-border border-l-2 bg-panel p-4 ${accent(finding)}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold">{finding.title}</h3>
        <Badge tone={toneFor(finding)}>{statusLabel(finding.status, finding.severity)}</Badge>
      </div>
      <p className="mt-2 text-sm text-muted">{finding.explanation}</p>
      <div className="mt-3 rounded-lg bg-panel-2 px-3 py-2 font-mono text-xs leading-5 text-text">
        {finding.evidence.length ? finding.evidence.map((line) => <div key={line}>{line}</div>) : <div>No additional evidence.</div>}
      </div>
      <p className="mt-3 text-sm">
        <span className="text-muted">Recommended: </span>
        {finding.recommendedAction}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => void copyText(formatFinding(finding), "Copied details")}>
          <Copy size={13} />
          Copy Details
        </Button>
        {fix?.kind === "execute" ? (
          <Button size="sm" onClick={() => onExecute(finding)}>
            <Wrench size={13} />
            Fix
          </Button>
        ) : null}
        {fix?.kind === "copy" ? (
          <Button size="sm" variant="secondary" onClick={() => void copyText(fix.commandText ?? "", "Copied command")}>
            <Copy size={13} />
            {fix.label}
          </Button>
        ) : null}
        {fix?.kind === "open-url" && fix.url ? (
          <Button size="sm" variant="secondary" onClick={() => void openDocs(fix.url!)}>
            <ExternalLink size={13} />
            {fix.label}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
