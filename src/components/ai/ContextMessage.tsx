import { ChevronDown, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";

const PREVIEW_LINES = 4;

export function ContextMessage({
  sourceLabel,
  content,
  onCopy,
}: {
  sourceLabel?: string;
  content: string;
  onCopy: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split("\n");
  const isLong = lines.length > PREVIEW_LINES || content.length > 320;
  const preview = isLong && !expanded ? `${lines.slice(0, PREVIEW_LINES).join("\n")}\n…` : content;

  return (
    <div className="flex justify-end">
      <div className="group max-w-[92%] rounded-xl border border-accent/25 bg-accent/10 px-3 py-2 text-[12px]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Context sent</p>
            {sourceLabel ? <p className="mt-0.5 truncate font-medium text-text">{sourceLabel}</p> : null}
          </div>
          <button
            type="button"
            title="Copy context"
            className="shrink-0 rounded p-1 text-muted opacity-0 hover:bg-hover hover:text-text group-hover:opacity-100"
            onClick={onCopy}
          >
            <Copy size={13} aria-hidden />
          </button>
        </div>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-muted">{preview}</pre>
        {isLong ? (
          <button
            type="button"
            className="mt-1.5 flex items-center gap-0.5 text-[11px] font-medium text-accent hover:underline"
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown size={12} className={cn("transition-transform", expanded && "rotate-180")} />
            {expanded ? "Show less" : `Show full context (${lines.length} lines)`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
