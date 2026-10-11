import { deriveThreadTitle } from "./compact-chat";
import {
  createEmptyChatStore,
  getActiveThread,
  newThreadId,
  type AiChatStore,
} from "./chat-storage";
import type { AiChatDraft, AiChatMessage, AiChatThread } from "./types";

export function ensureActiveThread(store: AiChatStore, title = "New chat"): AiChatStore {
  if (getActiveThread(store)) return store;
  const thread: AiChatThread = {
    id: newThreadId(),
    title,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    messages: [],
    explainSource: null,
    pinned: false,
    archived: false,
  };
  return {
    version: store.version,
    activeThreadId: thread.id,
    threads: [thread, ...store.threads],
  };
}

/** New thread for each Explain action (isolated debug session). */
export function beginExplainThread(store: AiChatStore, draft: AiChatDraft): AiChatStore {
  const next = createNewThread(store);
  return setActiveExplainSource(next, draft);
}

export function createNewThread(store: AiChatStore): AiChatStore {
  const thread: AiChatThread = {
    id: newThreadId(),
    title: "New chat",
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    messages: [],
    explainSource: null,
    pinned: false,
    archived: false,
  };
  return {
    version: store.version,
    activeThreadId: thread.id,
    threads: [thread, ...store.threads],
  };
}

export function selectThread(store: AiChatStore, threadId: string): AiChatStore {
  if (!store.threads.some((thread) => thread.id === threadId)) return store;
  return { ...store, activeThreadId: threadId };
}

export function deleteThread(store: AiChatStore, threadId: string): AiChatStore {
  const threads = store.threads.filter((thread) => thread.id !== threadId);
  if (!threads.length) return createEmptyChatStore();
  const activeThreadId =
    store.activeThreadId === threadId ? threads[0]?.id ?? null : store.activeThreadId;
  return { ...store, threads, activeThreadId };
}

export function appendMessagesToActive(
  store: AiChatStore,
  messages: AiChatMessage[],
  options?: { explainSource?: AiChatDraft | null; title?: string },
): AiChatStore {
  let next = ensureActiveThread(store, options?.title ?? "New chat");
  const active = getActiveThread(next);
  if (!active) return next;
  const combined = [...active.messages, ...messages];
  const title =
    active.messages.length === 0 && messages.length
      ? (options?.title ?? deriveThreadTitle(combined))
      : active.title;
  const updated: AiChatThread = {
    ...active,
    title,
    messages: combined,
    updatedAtMs: Date.now(),
    explainSource: options?.explainSource !== undefined ? options.explainSource : active.explainSource,
  };
  return {
    ...next,
    threads: next.threads.map((thread) => (thread.id === active.id ? updated : thread)),
  };
}

export function clearActiveThreadMessages(store: AiChatStore): AiChatStore {
  const active = getActiveThread(store);
  if (!active) return store;
  const updated: AiChatThread = {
    ...active,
    messages: [],
    explainSource: null,
    updatedAtMs: Date.now(),
  };
  return {
    ...store,
    threads: store.threads.map((thread) => (thread.id === active.id ? updated : thread)),
  };
}

export function renameThread(store: AiChatStore, threadId: string, title: string): AiChatStore {
  const trimmed = title.trim().slice(0, 80);
  if (!trimmed) return store;
  return updateThread(store, threadId, { title: trimmed });
}

export function updateThread(
  store: AiChatStore,
  threadId: string,
  patch: Partial<Pick<AiChatThread, "pinned" | "archived" | "title">>,
): AiChatStore {
  let activeThreadId = store.activeThreadId;
  const threads = store.threads.map((thread) =>
    thread.id === threadId ? { ...thread, ...patch, updatedAtMs: Date.now() } : thread,
  );
  if (patch.archived && activeThreadId === threadId) {
    const fallback = threads.find((thread) => thread.id !== threadId && !thread.archived);
    activeThreadId = fallback?.id ?? null;
  }
  if (patch.archived === false && !activeThreadId) {
    activeThreadId = threadId;
  }
  return { ...store, threads, activeThreadId };
}

export function setActiveExplainSource(store: AiChatStore, explainSource: AiChatDraft | null): AiChatStore {
  const active = getActiveThread(store);
  if (!active) return store;
  const updated = { ...active, explainSource, updatedAtMs: Date.now() };
  return {
    ...store,
    threads: store.threads.map((thread) => (thread.id === active.id ? updated : thread)),
  };
}
