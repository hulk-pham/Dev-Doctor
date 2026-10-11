import { Copy, ExternalLink, History, Loader2, MessageSquarePlus, MoreHorizontal, Send } from "lucide-react";
import { explainSourceNavButtonLabel } from "../../ai/explain-source-nav";
import type { PlannedStep } from "../../ai/fix-plan";
import { useEffect, useMemo, useRef, useState } from "react";
import { blankProjectChatPrompts, DIAGNOSIS_FOLLOW_UP_PROMPTS } from "../../ai/chat-quick-prompts";
import { estimateContextChars, MAX_CONTEXT_CHARS } from "../../ai/compact-chat";
import { planDiagnosisSteps } from "../../ai/fix-plan";
import type { FixExecutionResult, FixSuggestion } from "../../domain/types";
import { cn } from "../../lib/utils";
import { useAppState } from "../../state/AppState";
import { AiChatHistoryMenu } from "./AiChatHistoryMenu";
import { ChatQuickPrompts } from "./ChatQuickPrompts";
import { ContextMessage } from "./ContextMessage";
import { ChatMarkdown } from "./ChatMarkdown";
import { DiagnosisMessage } from "./DiagnosisMessage";
import { Button } from "../ui/button";
import { ToolbarIconButton } from "../ui/screen-toolbar";
import { FixDialog } from "../FixDialog";

const PREVIEW_LINES = 8;

function ChatBubble({
  role,
  content,
  compact,
  onCopy,
}: {
  role: "user" | "assistant";
  content: string;
  compact: boolean;
  onCopy: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split("\n");
  const isLong = compact && lines.length > PREVIEW_LINES;
  const shown = isLong && !expanded ? `${lines.slice(0, PREVIEW_LINES).join("\n")}\n…` : content;
  const isUser = role === "user";

  return (
    <div className={cn("group flex gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "relative min-w-0 max-w-[92%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed shadow-sm",
          isUser ? "bg-accent/20 text-text" : "border border-border/80 bg-panel-2/80 text-text",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap font-sans">{shown}</p>
        ) : (
          <ChatMarkdown content={shown} />
        )}
        {isLong ? (
          <button
            type="button"
            className="mt-1.5 text-[11px] font-medium text-accent hover:underline"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        title="Copy message"
        aria-label="Copy message"
        className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-hover hover:text-text focus-visible:opacity-100 group-hover:opacity-100"
        onClick={onCopy}
      >
        <Copy size={13} aria-hidden />
      </button>
    </div>
  );
}

export function AiChatPanel() {
  const state = useAppState();
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [pendingFix, setPendingFix] = useState<FixSuggestion | null>(null);
  const [fixPhase, setFixPhase] = useState<"confirm" | "running" | "done">("confirm");
  const [fixResult, setFixResult] = useState<FixExecutionResult | null>(null);
  const [pendingStop, setPendingStop] = useState<{ pid: number; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [stepBusy, setStepBusy] = useState(false);
  const [pendingFixStepIndex, setPendingFixStepIndex] = useState<number | null>(null);
  const [highlightStep, setHighlightStep] = useState<{ messageId: string; stepIndex: number } | null>(null);

  function nextActionableStepIndex(planned: PlannedStep[], afterIndex: number): number | null {
    for (const step of planned) {
      if (step.index <= afterIndex || !step.executable) continue;
      if (step.action === "runFix" || step.action === "copyCommand" || step.action === "deleteArtifact" || step.action === "stopProcess") {
        return step.index;
      }
    }
    return null;
  }

  const activeThread = state.aiChatThreads.find((thread) => thread.id === state.aiChatActiveThreadId);
  const explainSource = activeThread?.explainSource ?? null;

  const lastDiagnosisMessageId = useMemo(() => {
    for (let index = state.aiChatMessages.length - 1; index >= 0; index -= 1) {
      const message = state.aiChatMessages[index];
      if (message?.role === "assistant" && message.diagnosis) return message.id;
    }
    return null;
  }, [state.aiChatMessages]);

  const hasDiagnosis = lastDiagnosisMessageId != null;

  const quickPrompts = useMemo(() => {
    if (!state.aiKeyConfigured || state.aiChatSending) return [];
    if (hasDiagnosis) return [...DIAGNOSIS_FOLLOW_UP_PROMPTS];
    if (!state.aiChatMessages.length) return blankProjectChatPrompts(Boolean(state.scan));
    return [];
  }, [hasDiagnosis, state.aiChatMessages.length, state.aiKeyConfigured, state.aiChatSending, state.scan]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [state.aiChatMessages.length, state.aiChatSending, state.aiChatActiveThreadId]);

  useEffect(() => {
    if (!historyOpen && !headerMenuOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (headerRef.current?.contains(target)) return;
      setHistoryOpen(false);
      setHeaderMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [historyOpen, headerMenuOpen]);

  async function runFixConfirm() {
    if (!pendingFix) return;
    const completedStepIndex = pendingFixStepIndex;
    setFixPhase("running");
    try {
      const next = await state.runConfirmedFix(pendingFix);
      setFixResult(next);
      if (next.ok && completedStepIndex != null && lastDiagnosisMessageId) {
        const diagnosisMessage = state.aiChatMessages.find((entry) => entry.id === lastDiagnosisMessageId);
        if (diagnosisMessage?.diagnosis && diagnosisMessage.anchors) {
          const planned = planDiagnosisSteps(diagnosisMessage.diagnosis, diagnosisMessage.anchors);
          const nextStep = nextActionableStepIndex(planned, completedStepIndex);
          if (nextStep != null) {
            setHighlightStep({ messageId: lastDiagnosisMessageId, stepIndex: nextStep });
            state.showToast("Fix applied — next step highlighted below");
          } else {
            state.showToast("Fix applied");
          }
        }
      }
      await state.recheckChatDraft();
    } catch (error) {
      setFixResult({
        ok: false,
        command: "",
        exitCode: null,
        outputTail: "",
        error: error instanceof Error ? error.message : "The fix could not be started.",
      });
    } finally {
      setFixPhase("done");
    }
  }

  async function confirmStop() {
    if (!pendingStop) return;
    setStepBusy(true);
    try {
      await state.stopProcessForDiagnosis(pendingStop.pid);
      setPendingStop(null);
      await state.recheckChatDraft();
    } finally {
      setStepBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setStepBusy(true);
    try {
      await state.removeArtifacts([pendingDelete]);
      setPendingDelete(null);
      await state.recheckChatDraft();
    } finally {
      setStepBusy(false);
    }
  }

  const contextChars = estimateContextChars(state.aiChatMessages, draft);
  const contextHeavy = contextChars > MAX_CONTEXT_CHARS * 0.85;
  const showContextHint = contextHeavy || contextChars > 2_000;
  const threadTitle = activeThread?.title?.trim() || "New chat";
  const canSend = Boolean(draft.trim()) && !state.aiChatSending && state.aiKeyConfigured;

  function sendQuickPrompt(text: string) {
    void state.sendAiChatMessage(text);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={headerRef} className="relative shrink-0 border-b border-border pb-2">
        <div className="flex min-h-9 items-center gap-1">
          <h2 className="min-w-0 flex-1 truncate text-[12px] font-medium text-text" title={threadTitle}>
            {threadTitle}
          </h2>
          <ToolbarIconButton
            icon={MessageSquarePlus}
            label="New chat"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={() => {
              state.createNewAiChatThread();
              setHistoryOpen(false);
            }}
          />
          <ToolbarIconButton
            icon={History}
            label="Chat history"
            variant="ghost"
            className={cn("h-7 w-7 shrink-0", historyOpen && "bg-active text-text")}
            aria-expanded={historyOpen}
            onClick={() => {
              setHistoryOpen((open) => !open);
              setHeaderMenuOpen(false);
            }}
          />
          <div className="relative">
            <ToolbarIconButton
              icon={MoreHorizontal}
              label="Chat actions"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              aria-expanded={headerMenuOpen}
              onClick={() => {
                setHeaderMenuOpen((open) => !open);
                setHistoryOpen(false);
              }}
            />
            {headerMenuOpen ? (
              <div className="absolute right-0 top-full z-30 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-border bg-panel py-1 shadow-lg">
                <button
                  type="button"
                  className="flex w-full px-3 py-1.5 text-left text-[11px] hover:bg-hover"
                  onClick={() => {
                    if (window.confirm("Clear messages in this chat?")) state.clearAiChat();
                    setHeaderMenuOpen(false);
                  }}
                >
                  Clear messages
                </button>
                {state.aiChatActiveThreadId ? (
                  <button
                    type="button"
                    className="flex w-full px-3 py-1.5 text-left text-[11px] text-danger hover:bg-hover"
                    onClick={() => {
                      if (window.confirm("Delete this chat?")) state.deleteAiChatThread(state.aiChatActiveThreadId!);
                      setHeaderMenuOpen(false);
                    }}
                  >
                    Delete chat
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {explainSource ? (
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-[10px] text-muted">
              Explain source: <span className="font-medium text-text">{explainSource.sourceLabel}</span>
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-6 shrink-0 gap-1 px-2 text-[10px]"
              onClick={() => state.openExplainSourceView(explainSource)}
            >
              <ExternalLink size={12} aria-hidden />
              {explainSourceNavButtonLabel(explainSource)}
            </Button>
          </div>
        ) : null}
        {historyOpen ? <AiChatHistoryMenu onClose={() => setHistoryOpen(false)} /> : null}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto py-3 pr-0.5">
        {!state.aiChatMessages.length && !state.aiChatSending ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-panel-2/30 px-3 py-4">
            <p className="text-[12px] font-medium text-text">Diagnose, then follow up here</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              On Diagnostics, Cleanup, Processes, or Alerts, choose <span className="text-text">Explain with AI</span>.
              You get a structured summary and steps you can run in-app. Ask follow-up questions in plain language.
            </p>
            {!state.aiKeyConfigured ? (
              <p className="mt-2 text-[11px] text-muted">Add an API key in Settings → AI &amp; Privacy to send messages.</p>
            ) : null}
          </div>
        ) : null}

        {state.aiChatMessages.map((message) => {
          if (message.role === "assistant" && message.diagnosis && message.anchors) {
            const planned = planDiagnosisSteps(message.diagnosis, message.anchors);
            return (
              <DiagnosisMessage
                key={message.id}
                diagnosis={message.diagnosis}
                planned={planned}
                showRecheck={Boolean(explainSource && message.id === lastDiagnosisMessageId)}
                rechecking={state.aiChatRechecking}
                onRecheck={() => void state.recheckChatDraft()}
                onCopySummary={() => void state.copyText(message.diagnosis!.summary, "Copied")}
                onCopyCommand={(command) => void state.copyText(command, "Copied")}
                onReviewFix={(fix, stepIndex) => {
                  setPendingFix(fix);
                  setPendingFixStepIndex(stepIndex);
                  setFixPhase("confirm");
                  setFixResult(null);
                }}
                onDeleteArtifact={(path) => setPendingDelete(path)}
                onStopProcess={(pid, name) => setPendingStop({ pid, name })}
                stepBusy={stepBusy}
                highlightStepIndex={
                  highlightStep?.messageId === message.id ? highlightStep.stepIndex : null
                }
              />
            );
          }
          if (message.role === "user" && message.kind === "context") {
            return (
              <ContextMessage
                key={message.id}
                sourceLabel={message.sourceLabel}
                content={message.content}
                onCopy={() => void state.copyText(message.content, "Copied")}
              />
            );
          }
          return (
            <ChatBubble
              key={message.id}
              role={message.role}
              content={message.content}
              compact={message.content.length > 600}
              onCopy={() => void state.copyText(message.content, "Copied")}
            />
          );
        })}

        {state.aiChatSending ? (
          <div className="flex items-center justify-between gap-2 rounded-full border border-border bg-panel-2/60 px-3 py-1.5 text-[11px] text-muted">
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="shrink-0 animate-spin text-accent" />
              Thinking…
            </span>
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => state.cancelAiChatRequest()}>
              Cancel
            </button>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 space-y-2 border-t border-border pt-2">
        {state.aiChatError && !state.aiChatSending ? (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-2.5 py-2 text-[11px] text-danger">
            <p>{state.aiChatError.message}</p>
            {state.aiChatError.code === "noKey" ? (
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                <button type="button" className="font-medium text-accent hover:underline" onClick={() => state.openAiSettings()}>
                  Open AI settings
                </button>
                {import.meta.env.DEV && state.desktop ? (
                  <button
                    type="button"
                    className="font-medium text-accent hover:underline"
                    onClick={() => void state.enableDevMockAi()}
                  >
                    Use mock AI (dev)
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {!state.aiKeyConfigured && import.meta.env.DEV && state.desktop && !state.aiChatError ? (
          <p className="text-[11px] text-muted">
            No API key?{" "}
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => void state.enableDevMockAi()}>
              Enable mock AI
            </button>{" "}
            for local testing.
          </p>
        ) : null}

        {quickPrompts.length ? (
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Suggestions</p>
            <ChatQuickPrompts prompts={quickPrompts} disabled={state.aiChatSending} onSelect={sendQuickPrompt} />
          </div>
        ) : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            const text = draft.trim();
            if (!text || state.aiChatSending || !state.aiKeyConfigured) return;
            setDraft("");
            void state.sendAiChatMessage(text);
          }}
        >
          <div className="rounded-xl border border-border bg-panel p-2 shadow-sm focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/20">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
              placeholder={
                hasDiagnosis
                  ? "Ask a follow-up about this diagnosis…"
                  : state.aiKeyConfigured
                    ? "Message…"
                    : "Add an API key or enable mock AI (dev)"
              }
              disabled={!state.aiKeyConfigured || state.aiChatSending}
              className="min-h-[2.75rem] w-full resize-none bg-transparent text-[12px] leading-relaxed outline-none placeholder:text-muted disabled:opacity-60"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              {showContextHint ? (
                <p className={cn("text-[10px] tabular-nums", contextHeavy ? "text-warning" : "text-muted")}>
                  Context ~{contextChars.toLocaleString()}
                  {contextHeavy ? " — start a new chat if sends fail" : null}
                </p>
              ) : (
                <span className="text-[10px] text-muted">Enter to send · Shift+Enter for newline</span>
              )}
              <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={!canSend} title="Send message">
                <Send size={15} aria-hidden />
                <span className="sr-only">Send</span>
              </Button>
            </div>
          </div>
        </form>
      </div>

      {pendingStop ? (
        <div className="mt-2 rounded-lg border border-border bg-panel-2/40 p-2 text-[12px]">
          <p>
            Stop <span className="font-mono">{pendingStop.name}</span> (PID {pendingStop.pid})?
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="danger" disabled={stepBusy} onClick={() => void confirmStop()}>
              Confirm stop
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPendingStop(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="mt-2 rounded-lg border border-border bg-panel-2/40 p-2 text-[12px]">
          <p>
            Delete <span className="font-mono">{pendingDelete}</span> inside the selected project?
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="danger" disabled={stepBusy} onClick={() => void confirmDelete()}>
              Confirm delete
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <FixDialog
        suggestion={pendingFix}
        projectPath={state.projectPath}
        phase={fixPhase}
        result={fixResult}
        onCancel={() => {
          setPendingFix(null);
          setPendingFixStepIndex(null);
        }}
        onConfirm={() => void runFixConfirm()}
      />
    </div>
  );
}
