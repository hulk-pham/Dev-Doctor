import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ChevronRight,
  Circle,
  MoreHorizontal,
  Pin,
  PinOff,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  THREAD_BUCKET_LABELS,
  THREAD_BUCKET_ORDER,
  filterThreadsBySearch,
  groupActiveThreads,
  listArchivedThreads,
} from "../../ai/chat-history-list";
import type { AiChatThread } from "../../ai/types";
import { cn } from "../../lib/utils";
import { useAppState } from "../../state/AppState";

function ThreadRow({
  thread,
  selected,
  onSelect,
  onPin,
  onArchive,
  onDelete,
  onRename,
  archiveLabel,
}: {
  thread: AiChatThread;
  selected: boolean;
  onSelect: () => void;
  onPin: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onRename: () => void;
  archiveLabel: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hover, setHover] = useState(false);

  return (
    <div
      className="group flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-hover"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setMenuOpen(false);
      }}
    >
      <button type="button" className="shrink-0 text-muted" onClick={onSelect} aria-label={selected ? "Current chat" : "Open chat"}>
        {selected ? <CheckCircle2 size={14} className="text-accent" /> : <Circle size={14} />}
      </button>
      <button type="button" className="min-w-0 flex-1 truncate py-1 text-left text-[11px]" onClick={onSelect}>
        {thread.title}
      </button>
      {hover || menuOpen ? (
        <div className="flex shrink-0 items-center gap-0.5">
          <div className="relative">
            <button
              type="button"
              title="More"
              className="rounded p-0.5 text-muted hover:bg-panel hover:text-text"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-full z-30 mt-0.5 min-w-[7rem] rounded-md border border-border bg-panel py-1 shadow-lg">
                <button
                  type="button"
                  className="flex w-full px-2 py-1 text-left text-[11px] hover:bg-hover"
                  onClick={() => {
                    onRename();
                    setMenuOpen(false);
                  }}
                >
                  Rename…
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] hover:bg-hover"
                  onClick={() => {
                    onDelete();
                    setMenuOpen(false);
                  }}
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" title={thread.pinned ? "Unpin" : "Pin"} className="rounded p-0.5 text-muted hover:text-text" onClick={onPin}>
            {thread.pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          <button type="button" title={archiveLabel} className="rounded p-0.5 text-muted hover:text-text" onClick={onArchive}>
            {thread.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <div className="mt-2 first:mt-0">
      <p className="px-1 pb-0.5 text-[10px] uppercase tracking-wide text-muted">{label}</p>
      {children}
    </div>
  );
}

export function AiChatHistoryMenu({ onClose }: { onClose: () => void }) {
  const state = useAppState();
  const [query, setQuery] = useState("");
  const [archivedOpen, setArchivedOpen] = useState(false);

  const filtered = useMemo(
    () => filterThreadsBySearch(state.aiChatThreads, query),
    [query, state.aiChatThreads],
  );
  const { pinned, buckets } = useMemo(() => groupActiveThreads(filtered), [filtered]);
  const archived = useMemo(() => listArchivedThreads(filtered), [filtered]);

  function selectThread(threadId: string) {
    state.selectAiChatThread(threadId);
    onClose();
  }

  return (
    <div className="absolute left-0 right-0 top-full z-20 mt-1 flex max-h-[min(24rem,60vh)] flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-lg">
      <div className="border-b border-border px-2.5 py-2">
        <label className="flex h-8 items-center gap-2 rounded-lg border border-border bg-panel-2 px-2.5">
          <Search size={14} className="shrink-0 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats…"
            className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
        {pinned.length ? (
          <Section label="Pinned">
            {pinned.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                selected={thread.id === state.aiChatActiveThreadId}
                archiveLabel="Archive"
                onSelect={() => selectThread(thread.id)}
                onPin={() => state.setAiChatThreadPinned(thread.id, !thread.pinned)}
                onArchive={() => state.setAiChatThreadArchived(thread.id, true)}
                onDelete={() => {
                  if (window.confirm("Delete this chat?")) state.deleteAiChatThread(thread.id);
                }}
                onRename={() => {
                  const next = window.prompt("Chat title", thread.title);
                  if (next?.trim()) state.renameAiChatThread(thread.id, next);
                }}
              />
            ))}
          </Section>
        ) : null}
        {THREAD_BUCKET_ORDER.map((bucket) => {
          const items = buckets[bucket];
          if (!items.length) return null;
          return (
            <Section key={bucket} label={THREAD_BUCKET_LABELS[bucket]}>
              {items.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  selected={thread.id === state.aiChatActiveThreadId}
                  archiveLabel="Archive"
                  onSelect={() => selectThread(thread.id)}
                  onPin={() => state.setAiChatThreadPinned(thread.id, !thread.pinned)}
                  onArchive={() => state.setAiChatThreadArchived(thread.id, true)}
                  onDelete={() => {
                    if (window.confirm("Delete this chat?")) state.deleteAiChatThread(thread.id);
                  }}
                  onRename={() => {
                    const next = window.prompt("Chat title", thread.title);
                    if (next?.trim()) state.renameAiChatThread(thread.id, next);
                  }}
                />
              ))}
            </Section>
          );
        })}
        {!pinned.length && THREAD_BUCKET_ORDER.every((bucket) => !buckets[bucket].length) && !archived.length ? (
          <p className="px-2 py-3 text-[11px] text-muted">No chats yet</p>
        ) : null}
        {archived.length ? (
          <div className="mt-2 border-t border-border pt-2">
            <button
              type="button"
              className="flex w-full items-center gap-1 px-1 py-1 text-left text-[10px] uppercase tracking-wide text-muted hover:text-text"
              onClick={() => setArchivedOpen((open) => !open)}
            >
              <ChevronRight size={12} className={cn("transition-transform", archivedOpen && "rotate-90")} />
              Archived
            </button>
            {archivedOpen
              ? archived.map((thread) => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    selected={thread.id === state.aiChatActiveThreadId}
                    archiveLabel="Restore"
                    onSelect={() => selectThread(thread.id)}
                    onPin={() => state.setAiChatThreadPinned(thread.id, !thread.pinned)}
                    onArchive={() => state.setAiChatThreadArchived(thread.id, false)}
                    onDelete={() => {
                      if (window.confirm("Delete this chat?")) state.deleteAiChatThread(thread.id);
                    }}
                    onRename={() => {
                      const next = window.prompt("Chat title", thread.title);
                      if (next?.trim()) state.renameAiChatThread(thread.id, next);
                    }}
                  />
                ))
              : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
