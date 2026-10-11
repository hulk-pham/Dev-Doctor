import type { AiChatDraft } from "./types";

export function explainSourceNavButtonLabel(draft: AiChatDraft): string {
  switch (draft.sourceKind) {
    case "finding":
      return "View in Diagnostics";
    case "artifact":
      return "View in Cleanup";
    case "alert":
      return "View in Alerts";
    case "process":
      return "View in Processes";
  }
}
