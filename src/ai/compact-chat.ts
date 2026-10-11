import type { AiChatMessage } from "./types";

export type AiChatTurn = { role: "user" | "assistant"; content: string };

const CONTEXT_HEAD = "## ";
const DEFAULT_KEEP_FULL = 6;
const MAX_COMPACT_CHARS = 900;
const MAX_API_TURNS = 28;
export const MAX_CONTEXT_CHARS = 48_000;

export function estimateContextChars(messages: AiChatMessage[], extra = ""): number {
  const turns = buildChatTurnsForApi([...messages, ...(extra ? [{ id: "draft", role: "user" as const, content: extra, createdAtMs: 0 }] : [])]);
  return turns.reduce((sum, turn) => sum + turn.content.length, 0);
}

/** Shorter text for older turns when sending history to the model. */
export function compactMessageContent(content: string, maxChars = MAX_COMPACT_CHARS): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const isContext = trimmed.startsWith(CONTEXT_HEAD);
  const head = trimmed.slice(0, maxChars);
  return isContext ? `${head}\n… [earlier context compacted]` : `${head}…`;
}

/** OpenAI-style turns for `ai_chat`, with older messages compacted. */
export function buildChatTurnsForApi(messages: AiChatMessage[]): AiChatTurn[] {
  const slice = messages.slice(-MAX_API_TURNS);
  const fullFrom = Math.max(0, slice.length - DEFAULT_KEEP_FULL);
  return slice.map((message, index) => ({
    role: message.role,
    content: index < fullFrom ? compactMessageContent(message.content) : message.content.trim(),
  }));
}

export function deriveThreadTitle(messages: AiChatMessage[], fallback = "New chat"): string {
  const first = messages.find((message) => message.role === "user");
  if (!first) return fallback;
  if (first.sourceLabel?.trim()) return first.sourceLabel.trim().slice(0, 48);
  const line = first.content.split("\n").find((row) => row.trim())?.trim() ?? first.content.trim();
  if (line.startsWith(CONTEXT_HEAD)) {
    const section = line.replace(/^#+\s*/, "").slice(0, 48);
    return section || fallback;
  }
  return line.slice(0, 48) || fallback;
}

/** Diagnosis IPC: flatten prior thread + latest user block (legacy path). */
export function buildDiagnosisContextFromThread(messages: AiChatMessage[], latestUserContent: string): string {
  if (messages.length === 0) return latestUserContent.trim();
  const prior = messages
    .slice(-14)
    .map((message) => ({
      role: message.role,
      content: compactMessageContent(message.content, 700),
    }))
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}:\n${message.content}`)
    .join("\n\n---\n\n");
  return `${prior}\n\n---\n\nUser (latest):\n${latestUserContent.trim()}`;
}
