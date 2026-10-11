import type { AiChatThread } from "./types";

export type ThreadTimeBucket = "today" | "yesterday" | "previous7" | "older";

export const THREAD_BUCKET_LABELS: Record<ThreadTimeBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  previous7: "Previous 7 days",
  older: "Older",
};

export const THREAD_BUCKET_ORDER: ThreadTimeBucket[] = ["today", "yesterday", "previous7", "older"];

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function threadTimeBucket(updatedAtMs: number, nowMs = Date.now()): ThreadTimeBucket {
  const todayStart = startOfLocalDay(nowMs);
  const dayMs = 86_400_000;
  if (updatedAtMs >= todayStart) return "today";
  if (updatedAtMs >= todayStart - dayMs) return "yesterday";
  if (updatedAtMs >= todayStart - 7 * dayMs) return "previous7";
  return "older";
}

export function sortThreadsForList(threads: AiChatThread[]): AiChatThread[] {
  return [...threads].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return b.updatedAtMs - a.updatedAtMs;
  });
}

export function filterThreadsBySearch(threads: AiChatThread[], query: string): AiChatThread[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return threads;
  return threads.filter((thread) => thread.title.toLowerCase().includes(needle));
}

export function groupActiveThreads(threads: AiChatThread[], nowMs = Date.now()): {
  pinned: AiChatThread[];
  buckets: Record<ThreadTimeBucket, AiChatThread[]>;
} {
  const active = sortThreadsForList(threads.filter((thread) => !thread.archived));
  const pinned = active.filter((thread) => thread.pinned);
  const unpinned = active.filter((thread) => !thread.pinned);
  const buckets: Record<ThreadTimeBucket, AiChatThread[]> = {
    today: [],
    yesterday: [],
    previous7: [],
    older: [],
  };
  for (const thread of unpinned) {
    buckets[threadTimeBucket(thread.updatedAtMs, nowMs)].push(thread);
  }
  return { pinned, buckets };
}

export function listArchivedThreads(threads: AiChatThread[]): AiChatThread[] {
  return sortThreadsForList(threads.filter((thread) => thread.archived));
}
