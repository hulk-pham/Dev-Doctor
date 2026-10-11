import { describe, expect, it } from "vitest";
import { buildChatContextForApi } from "./build-chat-context";
import type { AiChatMessage } from "./types";

describe("buildChatContextForApi", () => {
  it("returns latest only when history is empty", () => {
    expect(buildChatContextForApi([], "hello")).toBe("hello");
  });

  it("includes prior turns before latest user block", () => {
    const messages: AiChatMessage[] = [
      { id: "1", role: "user", content: "first", createdAtMs: 1 },
      { id: "2", role: "assistant", content: "reply", createdAtMs: 2 },
    ];
    const out = buildChatContextForApi(messages, "second question");
    expect(out).toContain("User:\nfirst");
    expect(out).toContain("Assistant:\nreply");
    expect(out).toContain("User (latest):\nsecond question");
  });
});
