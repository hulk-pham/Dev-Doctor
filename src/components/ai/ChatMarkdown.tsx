import { parseChatMarkdown } from "../../ai/chat-markdown";
import { cn } from "../../lib/utils";

function InlineText({ text }: { text: string }) {
  const segments = text.split(/(`[^`]+`)/g);
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.startsWith("`") && segment.endsWith("`")) {
          return (
            <code key={index} className="rounded bg-panel px-1 py-0.5 font-mono text-[11px]">
              {segment.slice(1, -1)}
            </code>
          );
        }
        return <span key={index}>{segment}</span>;
      })}
    </>
  );
}

export function ChatMarkdown({ content, className }: { content: string; className?: string }) {
  const blocks = parseChatMarkdown(content);
  if (!blocks.length) {
    return <p className={cn("whitespace-pre-wrap font-sans", className)}>{content}</p>;
  }
  return (
    <div className={cn("space-y-2 font-sans", className)}>
      {blocks.map((block, index) =>
        block.type === "code" ? (
          <pre
            key={index}
            className="overflow-x-auto rounded-lg border border-border bg-panel px-2 py-1.5 font-mono text-[11px] leading-relaxed"
          >
            {block.text}
          </pre>
        ) : (
          <p key={index} className="whitespace-pre-wrap leading-relaxed">
            <InlineText text={block.text} />
          </p>
        ),
      )}
    </div>
  );
}
