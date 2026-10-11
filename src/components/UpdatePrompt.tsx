import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { useAppState } from "../state/AppState";

export function UpdatePrompt() {
  const state = useAppState();
  const offer = state.updateOffer;
  const open = offer?.status === "available";

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) state.dismissUpdate(); }}>
      <DialogContent title="Update available" description={offer?.message}>
        {offer?.notes ? (
          <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-[13px] text-muted">{offer.notes}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {offer?.url ? (
            <Button
              size="sm"
              onClick={() => {
                void state.downloadUpdate().catch(() => undefined);
              }}
            >
              Download
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={state.remindUpdateLater}>
            Remind me later
          </Button>
          <Button size="sm" variant="secondary" onClick={state.skipUpdateVersion}>
            Skip this version
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
