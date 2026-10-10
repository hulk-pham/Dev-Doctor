import { Loader } from "lucide-react";
import type { FixExecutionResult, FixSuggestion } from "../domain/types";
import { buildFixPreview } from "../diagnostics/fixes";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";

export function FixDialog({
  suggestion,
  projectPath,
  phase,
  result,
  onCancel,
  onConfirm,
}: {
  suggestion: FixSuggestion | null;
  projectPath: string | null;
  phase: "confirm" | "running" | "done";
  result: FixExecutionResult | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const preview = suggestion && projectPath ? buildFixPreview(suggestion, projectPath) : null;
  return (
    <Dialog open={suggestion != null} onOpenChange={(open) => !open && phase !== "running" && onCancel()}>
      <DialogContent
        title={phase === "done" ? (result?.ok ? "Fix finished" : "Fix did not complete") : "Confirm fix"}
        description="Nothing runs until you confirm. The command below is the only operation Dev Doctor will start."
      >
        {preview ? (
          <div className="space-y-3 text-sm">
            <Field label="What will change" value={preview.whatChanges} />
            <Field label="Command" value={result?.command || preview.operation} mono />
            <Field label="Working directory" value={preview.workingDirectory} mono />
            <Field label="Potential side effects" value={preview.sideEffects} />
            {preview.blockedReason ? <p className="text-danger">{preview.blockedReason}</p> : null}
            {phase === "running" ? (
              <p className="flex items-center gap-2 text-muted">
                <Loader size={14} className="animate-spin" />
                Running the allowlisted command…
              </p>
            ) : null}
            {phase === "done" && result ? (
              <div className="space-y-2">
                <p className={result.ok ? "text-success" : "text-danger"}>{result.ok ? "The command finished." : result.error}</p>
                {result.outputTail ? (
                  <pre className="max-h-40 overflow-auto rounded-lg bg-panel-2 p-3 font-mono text-xs whitespace-pre-wrap">{result.outputTail}</pre>
                ) : null}
              </div>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              {phase === "confirm" ? (
                <>
                  <Button variant="ghost" onClick={onCancel}>
                    Cancel
                  </Button>
                  <Button onClick={onConfirm} disabled={!preview.executable}>
                    Confirm
                  </Button>
                </>
              ) : null}
              {phase === "done" ? <Button onClick={onCancel}>Close</Button> : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={mono ? "mt-1 break-all font-mono text-xs" : "mt-1"}>{value}</div>
    </div>
  );
}
