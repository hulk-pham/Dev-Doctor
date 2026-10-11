import { describe, expect, it } from "vitest";
import { groupActiveThreads, threadTimeBucket } from "./chat-history-list";
import type { AiChatThread } from "./types";

function thread(id: string, updatedAtMs: number, extra: Partial<AiChatThread> = {}): AiChatThread {
  return {
    id,
    title: id,
    createdAtMs: updatedAtMs,
    updatedAtMs,
    messages: [],
    explainSource: null,
    pinned: false,
    archived: false,
    ...extra,
  };
}

describe("chat-history-list", () => {
  it("places threads in today bucket", () => {
    const now = Date.parse("2026-10-11T15:00:00");
    expect(threadTimeBucket(now - 60_000, now)).toBe("today");
  });

  it("groups pinned separately from time buckets", () => {
    const now = Date.parse("2026-10-11T15:00:00");
    const { pinned, buckets } = groupActiveThreads(
      [
        thread("a", now, { pinned: true }),
        thread("b", now - 2 * 86_400_000),
      ],
      now,
    );
    expect(pinned.map((t) => t.id)).toEqual(["a"]);
    expect(buckets.today.map((t) => t.id)).toEqual([]);
    expect(buckets.previous7.map((t) => t.id)).toEqual(["b"]);
  });
});
