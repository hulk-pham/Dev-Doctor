import { isTauri } from "@tauri-apps/api/core";
import { aiChatStoreLoad, aiChatStoreSave } from "../services/tauri";
import type { AiChatMessage, AiChatThread } from "./types";

const PREFIX = "dev-doctor-ai-chat:";
const STORE_VERSION = 2 as const;

export function chatScopeKey(projectPath: string | null): string {
  return projectPath?.trim() || "__machine__";
}

export interface AiChatStore {
  version: typeof STORE_VERSION;
  activeThreadId: string | null;
  threads: AiChatThread[];
}

function storageKey(scope: string): string {
  return `${PREFIX}${scope}`;
}

export function createEmptyChatStore(): AiChatStore {
  return { version: STORE_VERSION, activeThreadId: null, threads: [] };
}

function trimStore(store: AiChatStore): AiChatStore {
  return {
    ...store,
    threads: store.threads
      .slice(-40)
      .map((thread) => ({
        ...thread,
        messages: thread.messages.slice(-80),
      })),
  };
}

export function parseChatStoreJson(raw: string | null | undefined): AiChatStore {
  if (!raw?.trim()) return createEmptyChatStore();
  try {
    return normalizeStore(JSON.parse(raw) as unknown);
  } catch {
    return createEmptyChatStore();
  }
}

export function loadChatStore(scope: string): AiChatStore {
  if (typeof localStorage === "undefined") return createEmptyChatStore();
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return createEmptyChatStore();
    return normalizeStore(JSON.parse(raw) as unknown);
  } catch {
    return createEmptyChatStore();
  }
}

export async function loadChatStorePersisted(scope: string): Promise<AiChatStore> {
  if (isTauri()) {
    try {
      const raw = await aiChatStoreLoad(scope);
      if (raw) {
        const store = parseChatStoreJson(raw);
        saveChatStore(scope, store);
        return store;
      }
    } catch {
      // fall through to localStorage
    }
  }
  return loadChatStore(scope);
}

export function saveChatStore(scope: string, store: AiChatStore): void {
  const trimmed = trimStore(store);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(storageKey(scope), JSON.stringify(trimmed));
    } catch {
      // Quota or private mode — keep in-memory only.
    }
  }
  if (isTauri()) {
    void aiChatStoreSave(scope, JSON.stringify(trimmed)).catch(() => undefined);
  }
}

function normalizeStore(value: unknown): AiChatStore {
  if (Array.isArray(value)) {
    return migrateLegacyMessages(value.filter(isChatMessage));
  }
  if (!value || typeof value !== "object") return createEmptyChatStore();
  const row = value as Partial<AiChatStore>;
  if (row.version !== STORE_VERSION || !Array.isArray(row.threads)) {
    return createEmptyChatStore();
  }
  const threads = row.threads.filter(isThread).map((thread) => ({
    ...thread,
    explainSource: thread.explainSource ?? null,
    pinned: Boolean(thread.pinned),
    archived: Boolean(thread.archived),
  }));
  const activeThreadId =
    typeof row.activeThreadId === "string" && threads.some((thread) => thread.id === row.activeThreadId)
      ? row.activeThreadId
      : threads[0]?.id ?? null;
  return { version: STORE_VERSION, activeThreadId, threads };
}

function migrateLegacyMessages(messages: AiChatMessage[]): AiChatStore {
  if (!messages.length) return createEmptyChatStore();
  const thread: AiChatThread = {
    id: newThreadId(),
    title: "Previous chat",
    createdAtMs: messages[0]?.createdAtMs ?? Date.now(),
    updatedAtMs: messages[messages.length - 1]?.createdAtMs ?? Date.now(),
    messages,
    explainSource: null,
    pinned: false,
    archived: false,
  };
  return { version: STORE_VERSION, activeThreadId: thread.id, threads: [thread] };
}

export function newThreadId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getActiveThread(store: AiChatStore): AiChatThread | null {
  if (!store.activeThreadId) return null;
  return store.threads.find((thread) => thread.id === store.activeThreadId) ?? null;
}

function isChatMessage(value: unknown): value is AiChatMessage {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<AiChatMessage>;
  return (
    typeof row.id === "string" &&
    (row.role === "user" || row.role === "assistant") &&
    typeof row.content === "string" &&
    typeof row.createdAtMs === "number"
  );
}

function isThread(value: unknown): value is AiChatThread {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<AiChatThread>;
  return (
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    typeof row.createdAtMs === "number" &&
    typeof row.updatedAtMs === "number" &&
    Array.isArray(row.messages) &&
    row.messages.every(isChatMessage) &&
    (row.explainSource === undefined || row.explainSource === null || typeof row.explainSource === "object")
  );
}
