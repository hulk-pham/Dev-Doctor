import { ChevronDown, Copy, ExternalLink, Wrench } from "lucide-react";
import { useState } from "react";
import type { DiagnosticFinding } from "../domain/types";
import { statusLabel } from "../diagnostics/engine";
import { findingRowAccent, findingTone } from "../lib/finding-severity";
import { formatFinding } from "./FindingCard";
import { useAppState } from "../state/AppState";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

export function CompactFindingRow({
  finding,
  onExecute,
  onExplain,
}: {
  finding: DiagnosticFinding;
  onExecute: (finding: DiagnosticFinding) => void;
  onExplain?: (finding: DiagnosticFinding) => void;
}) {
  const { copyText, openDocs } = useAppState();
  const [open, setOpen] = useState(finding.severity === "error");
  const fix = finding.fix;
  const tone = findingTone(finding);

  return (
    <li className={cn("border-b border-border last:border-b-0", findingRowAccent(tone))}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 py-2 pl-2.5 pr-3 text-left hover:bg-black/[0.03]"
      >
        <ChevronDown size={14} className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} />
        <span className="min-w-0 flex-1 truncate text-[13px]">{finding.title}</span>
        <Badge tone={tone}>{statusLabel(finding.status, finding.severity)}</Badge>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border bg-panel-2/40 px-3 py-2 text-[13px]">
          <p className="text-muted">{finding.explanation}</p>
          <div className="rounded-md bg-panel px-2 py-1.5 font-mono text-[11px] leading-5">
            {finding.evidence.length ? finding.evidence.map((line) => <div key={line}>{line}</div>) : "No additional evidence."}
          </div>
          <p>
            <span className="text-muted">Recommended: </span>
            {finding.recommendedAction}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {onExplain ? (
              <Button size="sm" variant="secondary" onClick={() => onExplain(finding)}>
                Explain with AI
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" onClick={() => void copyText(formatFinding(finding), "Copied details")}>
              <Copy size={12} />
              Copy
            </Button>
            {fix?.kind === "execute" ? (
              <Button size="sm" variant="secondary" onClick={() => onExecute(finding)}>
                <Wrench size={12} />
                Run fix
              </Button>
            ) : null}
            {fix?.kind === "copy" ? (
              <Button size="sm" variant="secondary" onClick={() => void copyText(fix.commandText ?? "", "Copied")}>
                <Copy size={12} />
                {fix.label}
              </Button>
            ) : null}
            {fix?.kind === "open-url" && fix.url ? (
              <Button size="sm" variant="secondary" onClick={() => void openDocs(fix.url!)}>
                <ExternalLink size={12} />
                {fix.label}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
