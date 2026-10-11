import { ChevronDown, Copy } from "lucide-react";
import { useState } from "react";
import type { PlannedStep } from "../../ai/fix-plan";
import type { AiDiagnosisResponse, AiStepRisk } from "../../ai/types";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

function riskTone(risk: AiStepRisk): "neutral" | "warning" | "error" {
  if (risk === "danger") return "error";
  if (risk === "confirm") return "warning";
  return "neutral";
}

export function DiagnosisMessage({
  diagnosis,
  planned,
  showRecheck,
  rechecking,
  onRecheck,
  onCopySummary,
  onCopyCommand,
  onReviewFix,
  onDeleteArtifact,
  onStopProcess,
  stepBusy,
  highlightStepIndex,
}: {
  diagnosis: AiDiagnosisResponse;
  planned: PlannedStep[];
  showRecheck: boolean;
  rechecking: boolean;
  onRecheck: () => void;
  onCopySummary: () => void;
  onCopyCommand: (command: string) => void;
  onReviewFix: (fix: import("../../domain/types").FixSuggestion, stepIndex: number) => void;
  onDeleteArtifact: (path: string) => void;
  onStopProcess: (pid: number, name: string) => void;
  stepBusy: boolean;
  highlightStepIndex: number | null;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className="max-w-[95%] rounded-xl border border-border bg-panel px-3 py-2.5 text-[12px] shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-snug text-text">{diagnosis.summary}</p>
        <button
          type="button"
          title="Copy summary"
          className="shrink-0 rounded p-1 text-muted hover:bg-hover hover:text-text"
          onClick={onCopySummary}
        >
          <Copy size={13} aria-hidden />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={diagnosis.confidence === "high" ? "pass" : diagnosis.confidence === "low" ? "warning" : "neutral"}>
          Confidence: {diagnosis.confidence}
        </Badge>
      </div>

      {planned.length ? (
        <ol className="mt-3 space-y-2">
          {planned.map((step) => (
            <li
              key={step.index}
              className={cn(
                "rounded-lg border border-border/80 bg-panel-2/50 px-2.5 py-2",
                highlightStepIndex === step.index && "ring-2 ring-accent/50",
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-medium tabular-nums text-muted">{step.index}.</span>
                <Badge tone={riskTone(step.risk)}>{step.risk}</Badge>
              </div>
              <p className="mt-1 leading-snug">{step.step}</p>
              {step.executable ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {step.action === "copyCommand" && step.payload?.command ? (
                    <Button size="sm" variant="secondary" onClick={() => onCopyCommand(step.payload!.command!)}>
                      Copy command
                    </Button>
                  ) : null}
                  {step.action === "runFix" && step.payload?.fix ? (
                    <Button size="sm" variant="secondary" onClick={() => onReviewFix(step.payload!.fix!, step.index)}>
                      Review fix
                    </Button>
                  ) : null}
                  {step.action === "deleteArtifact" && step.payload?.relativePath ? (
                    <Button size="sm" variant="danger" disabled={stepBusy} onClick={() => onDeleteArtifact(step.payload!.relativePath!)}>
                      Delete…
                    </Button>
                  ) : null}
                  {step.action === "stopProcess" && step.payload?.pid != null ? (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={stepBusy}
                      onClick={() => onStopProcess(step.payload!.pid!, step.payload!.processName ?? "process")}
                    >
                      Stop process…
                    </Button>
                  ) : null}
                </div>
              ) : step.refusedReason ? (
                <p className="mt-1 text-[10px] text-muted">{step.refusedReason}</p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {diagnosis.verification.trim() ? (
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          <span className="font-medium text-text">Verify: </span>
          {diagnosis.verification}
        </p>
      ) : null}

      {diagnosis.evidence.length || diagnosis.possibleCauses.length ? (
        <div className="mt-3 border-t border-border pt-2">
          <button
            type="button"
            className="flex w-full items-center gap-1 text-[11px] font-medium text-muted hover:text-text"
            onClick={() => setDetailsOpen((open) => !open)}
          >
            <ChevronDown size={14} className={cn("transition-transform", detailsOpen && "rotate-180")} />
            Evidence & possible causes
          </button>
          {detailsOpen ? (
            <div className="mt-2 space-y-2 text-[11px] text-muted">
              {diagnosis.evidence.length ? (
                <div>
                  <p className="font-medium text-text">Evidence</p>
                  <ul className="mt-0.5 list-inside list-disc">
                    {diagnosis.evidence.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {diagnosis.possibleCauses.length ? (
                <div>
                  <p className="font-medium text-text">Possible causes</p>
                  <ul className="mt-0.5 list-inside list-disc">
                    {diagnosis.possibleCauses.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {showRecheck ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-3 w-full"
          disabled={rechecking}
          onClick={onRecheck}
        >
          {rechecking ? "Refreshing evidence…" : "Refresh evidence & re-ask AI"}
        </Button>
      ) : null}
    </div>
  );
}
