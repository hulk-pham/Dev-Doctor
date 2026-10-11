import { Loader, X } from "lucide-react";
import { useState } from "react";
import { planDiagnosisSteps } from "../../ai/fix-plan";
import {
  composeContextText,
  removeContextItem,
  toggleContextItem,
} from "../../ai/context-builder";
import type { FixExecutionResult, FixSuggestion } from "../../domain/types";
import { cn } from "../../lib/utils";
import { useAppState } from "../../state/AppState";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { FixDialog } from "../FixDialog";

export function DiagnosisPanel() {
  const state = useAppState();
  const session = state.diagnosisSession;
  const [pendingFix, setPendingFix] = useState<FixSuggestion | null>(null);
  const [fixPhase, setFixPhase] = useState<"confirm" | "running" | "done">("confirm");
  const [fixResult, setFixResult] = useState<FixExecutionResult | null>(null);
  const [pendingStop, setPendingStop] = useState<{ pid: number; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [stepBusy, setStepBusy] = useState(false);

  if (!session) {
    return <p className="text-[11px] text-muted">Select Explain with AI on an alert, finding, cleanup row, or process.</p>;
  }

  const preview = composeContextText(session.items);
  const planned = session.result ? planDiagnosisSteps(session.result, session.anchors) : [];

  async function runFixConfirm() {
    if (!pendingFix) return;
    setFixPhase("running");
    try {
      const next = await state.runConfirmedFix(pendingFix);
      setFixResult(next);
      await state.recheckDiagnosis();
    } catch (error) {
      setFixResult({
        ok: false,
        command: "",
        exitCode: null,
        outputTail: "",
        error: error instanceof Error ? error.message : "The fix could not be started.",
      });
    } finally {
      setFixPhase("done");
    }
  }

  async function confirmStop() {
    if (!pendingStop) return;
    setStepBusy(true);
    try {
      await state.stopProcessForDiagnosis(pendingStop.pid);
      setPendingStop(null);
      await state.recheckDiagnosis();
    } finally {
      setStepBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setStepBusy(true);
    try {
      await state.removeArtifacts([pendingDelete]);
      setPendingDelete(null);
      await state.recheckDiagnosis();
    } finally {
      setStepBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted">Diagnosis</p>
          <h2 className="truncate font-medium">{session.sourceLabel}</h2>
        </div>
        <button
          type="button"
          title="Close diagnosis"
          className="shrink-0 text-muted hover:text-text"
          onClick={() => state.closeDiagnosis()}
        >
          <X size={16} />
        </button>
      </div>

      {!session.result ? (
        <>
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {session.items.map((item) => (
              <li key={item.id} className="rounded-lg border border-border px-2 py-1.5">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={item.included}
                    onChange={(event) => state.updateDiagnosisItems(toggleContextItem(session.items, item.id, event.target.checked))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-[12px] font-medium">{item.label}</span>
                    {item.optIn ? <span className="ml-1 text-[10px] text-muted">Optional</span> : null}
                  </span>
                </label>
                {item.optIn ? (
                  <button
                    type="button"
                    className="mt-0.5 text-[10px] text-accent hover:underline"
                    onClick={() => state.updateDiagnosisItems(removeContextItem(session.items, item.id))}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {session.error ? <p className="text-[11px] text-danger">{session.error.message}</p> : null}
          <Button size="sm" className="w-full" disabled={session.sending || !preview.trim()} onClick={() => void state.sendDiagnosis()}>
            {session.sending ? (
              <>
                <Loader size={14} className="animate-spin" />
                Sending…
              </>
            ) : (
              "Send to AI"
            )}
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <p className="font-medium leading-snug">{session.result.summary}</p>
            <Badge tone="neutral">Confidence: {session.result.confidence}</Badge>
            {session.result.evidence.length ? (
              <ul className="list-disc pl-4 text-[12px] text-muted">
                {session.result.evidence.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            {session.result.possibleCauses.length ? (
              <>
                <p className="text-[11px] uppercase tracking-wide text-muted">Possible causes</p>
                <ul className="list-disc pl-4 text-[12px]">
                  {session.result.possibleCauses.map((cause) => (
                    <li key={cause}>{cause}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>

          {planned.length ? (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-muted">Steps</p>
              <ol className="space-y-2">
                {planned.map((step) => (
                  <li key={step.index} className="rounded-lg border border-border px-2 py-1.5 text-[12px]">
                    <p>{step.step}</p>
                    <p className="mt-0.5 text-[10px] text-muted">Risk: {step.risk}</p>
                    {step.refusedReason ? <p className="mt-1 text-[11px] text-warning">{step.refusedReason}</p> : null}
                    {step.executable ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {step.action === "copyCommand" && step.payload?.command ? (
                          <Button size="sm" variant="secondary" onClick={() => void state.copyText(step.payload!.command!, "Copied")}>
                            Copy command
                          </Button>
                        ) : null}
                        {step.action === "openUrl" && step.payload?.url ? (
                          <Button size="sm" variant="secondary" onClick={() => void state.openDocs(step.payload!.url!)}>
                            Open docs
                          </Button>
                        ) : null}
                        {step.action === "runFix" && step.payload?.fix ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setPendingFix(step.payload!.fix!);
                              setFixPhase("confirm");
                              setFixResult(null);
                            }}
                          >
                            Review fix
                          </Button>
                        ) : null}
                        {step.action === "deleteArtifact" && step.payload?.relativePath ? (
                          <Button size="sm" variant="danger" disabled={stepBusy} onClick={() => setPendingDelete(step.payload!.relativePath!)}>
                            Delete path…
                          </Button>
                        ) : null}
                        {step.action === "stopProcess" && step.payload?.pid != null ? (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={stepBusy}
                            onClick={() =>
                              setPendingStop({ pid: step.payload!.pid!, name: step.payload!.processName ?? "process" })
                            }
                          >
                            Stop process…
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <p className="text-[12px] text-muted">{session.result.verification}</p>

          {session.baselineContext && session.afterContext ? (
            <div className="space-y-1 rounded-lg bg-panel-2/50 p-2 text-[11px]">
              <p className="font-medium text-muted">Before / after context</p>
              <pre className="max-h-24 overflow-auto whitespace-pre-wrap font-mono">{session.baselineContext}</pre>
              <pre className={cn("max-h-24 overflow-auto whitespace-pre-wrap font-mono", session.afterContext !== session.baselineContext && "text-success")}>
                {session.afterContext}
              </pre>
            </div>
          ) : null}

          <Button size="sm" variant="secondary" className="w-full" disabled={session.rechecking} onClick={() => void state.recheckDiagnosis()}>
            {session.rechecking ? "Refreshing evidence…" : "Run check again"}
          </Button>
        </>
      )}

      {pendingStop ? (
        <div className="rounded-lg border border-border bg-panel-2/40 p-2 text-[12px]">
          <p>
            Stop <span className="font-mono">{pendingStop.name}</span> (PID {pendingStop.pid})?
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="danger" disabled={stepBusy} onClick={() => void confirmStop()}>
              Confirm stop
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPendingStop(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="rounded-lg border border-border bg-panel-2/40 p-2 text-[12px]">
          <p>
            Delete <span className="font-mono">{pendingDelete}</span> inside the selected project?
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="danger" disabled={stepBusy} onClick={() => void confirmDelete()}>
              Confirm delete
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <FixDialog
        suggestion={pendingFix}
        projectPath={state.projectPath}
        phase={fixPhase}
        result={fixResult}
        onCancel={() => setPendingFix(null)}
        onConfirm={() => void runFixConfirm()}
      />
    </div>
  );
}
