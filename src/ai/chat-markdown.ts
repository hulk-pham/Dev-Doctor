export type ChatMarkdownBlock =
  | { type: "paragraph"; text: string }
  | { type: "code"; text: string };

/** Minimal markdown: fenced ``` blocks and `inline code`. */
export function parseChatMarkdown(input: string): ChatMarkdownBlock[] {
  const blocks: ChatMarkdownBlock[] = [];
  const parts = input.split("```");
  for (let index = 0; index < parts.length; index += 1) {
    const chunk = parts[index];
    if (index % 2 === 1) {
      const code = chunk.replace(/^\w*\n?/, "").trimEnd();
      if (code) blocks.push({ type: "code", text: code });
      continue;
    }
    const paragraphs = chunk.split(/\n{2,}/);
    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (trimmed) blocks.push({ type: "paragraph", text: trimmed });
    }
  }
  return blocks;
}
