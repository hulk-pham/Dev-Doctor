import { Loader } from "lucide-react";
import type { AiContextItem, AiDiagnosisResponse, AiError } from "../../ai/types";
import { composeContextText } from "../../ai/context-builder";
import { Button } from "../ui/button";
import { Dialog, DialogContent } from "../ui/dialog";

export function AiContextPreviewDialog({
  open,
  items,
  onToggleItem,
  onRemoveItem,
  onClose,
  onSend,
  sending,
  result,
  error,
}: {
  open: boolean;
  items: AiContextItem[];
  onToggleItem: (id: string, included: boolean) => void;
  onRemoveItem: (id: string) => void;
  onClose: () => void;
  onSend: () => void;
  sending: boolean;
  result: AiDiagnosisResponse | null;
  error: AiError | null;
}) {
  const preview = composeContextText(items);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !sending && onClose()}>
      <DialogContent
        title="Review before sending"
        description="Only checked items leave this Mac. Your API key stays in Keychain — it is not shown here."
        className="w-[min(640px,calc(100vw-2rem))]"
      >
        <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-lg border border-border px-3 py-2">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={item.included}
                    onChange={(event) => onToggleItem(item.id, event.target.checked)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{item.label}</span>
                    {item.optIn ? <span className="ml-2 text-[11px] text-muted">Optional</span> : null}
                    <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-muted">{item.content}</pre>
                  </span>
                </label>
                {item.optIn ? (
                  <button type="button" className="mt-1 text-[11px] text-accent hover:underline" onClick={() => onRemoveItem(item.id)}>
                    Remove from list
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted">Payload preview</p>
            <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-panel-2 p-2 font-mono text-[11px] whitespace-pre-wrap">{preview || "Nothing selected."}</pre>
          </div>
          {error ? <p className="text-danger">{error.message}</p> : null}
          {result ? (
            <div className="space-y-2 rounded-lg border border-border bg-panel-2/40 p-3">
              <p className="font-medium">{result.summary}</p>
              <p className="text-[11px] text-muted">Confidence: {result.confidence}</p>
              {result.possibleCauses.length ? (
                <ul className="list-disc pl-4 text-[13px]">
                  {result.possibleCauses.map((cause) => (
                    <li key={cause}>{cause}</li>
                  ))}
                </ul>
              ) : null}
              <p className="text-[11px] text-muted">{result.verification}</p>
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" disabled={sending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={sending || !preview.trim()} onClick={onSend}>
            {sending ? (
              <>
                <Loader size={14} className="animate-spin" />
                Sending…
              </>
            ) : (
              "Send"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
