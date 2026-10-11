import { describe, expect, it } from "vitest";
import { buildChatTurnsForApi, buildDiagnosisContextFromThread, compactMessageContent } from "./compact-chat";
import type { AiChatMessage } from "./types";

describe("compact-chat", () => {
  it("compacts long context blocks", () => {
    const long = `## Cleanup row\n${"x".repeat(2000)}`;
    const out = compactMessageContent(long, 100);
    expect(out.length).toBeLessThan(200);
    expect(out).toContain("compacted");
  });

  it("builds API turns with recent messages full length", () => {
    const messages: AiChatMessage[] = Array.from({ length: 10 }, (_, index) => ({
      id: String(index),
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: index === 0 ? "a".repeat(2000) : `turn ${index}`,
      createdAtMs: index,
    }));
    const turns = buildChatTurnsForApi(messages);
    expect(turns[0].content.length).toBeLessThan(2000);
    expect(turns[turns.length - 1].content).toBe("turn 9");
  });

  it("buildDiagnosisContextFromThread includes latest user block", () => {
    const messages: AiChatMessage[] = [{ id: "1", role: "assistant", content: "hi", createdAtMs: 1 }];
    const out = buildDiagnosisContextFromThread(messages, "new context");
    expect(out).toContain("User (latest):\nnew context");
  });
});
