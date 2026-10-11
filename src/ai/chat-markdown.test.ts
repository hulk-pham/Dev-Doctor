import { describe, expect, it } from "vitest";
import { parseChatMarkdown } from "./chat-markdown";

describe("parseChatMarkdown", () => {
  it("splits fenced code blocks", () => {
    const blocks = parseChatMarkdown("Hello\n\n```bash\nnpm test\n```");
    expect(blocks).toEqual([
      { type: "paragraph", text: "Hello" },
      { type: "code", text: "npm test" },
    ]);
  });
});
