import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildChatTurnsForApi, buildDiagnosisContextFromThread } from "../ai/compact-chat";
import {
  appendMessagesToActive,
  beginExplainThread,
  clearActiveThreadMessages,
  createNewThread,
  deleteThread,
  ensureActiveThread,
  renameThread,
  selectThread,
  setActiveExplainSource,
  updateThread,
} from "../ai/chat-store-ops";
import {
  buildAlertContextItems,
  buildArtifactContextItems,
  buildFindingContextItems,
  buildProcessContextItems,
  composeContextText,
} from "../ai/context-builder";
import { chatScopeKey, getActiveThread, loadChatStore, loadChatStorePersisted, saveChatStore, type AiChatStore } from "../ai/chat-storage";
import { formatDiagnosisForChat } from "../ai/format-diagnosis";
import type { AiChatDraft, AiChatMessage, AiContextItem, AiError } from "../ai/types";
import type { DiagnosticFinding, MonitorAlert, ScanResult } from "../domain/types";
import type { ArtifactFinding } from "../diagnostics/artifacts";
import { errorMessage } from "../lib/utils";
import { aiCancelInflight, aiChat, aiDiagnose, terminateProcess } from "../services/tauri";
import type { SidePanelTab, View } from "./AppState";

function newChatMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isCancelledError(cause: unknown): boolean {
  return typeof cause === "object" && cause !== null && "code" in cause && (cause as AiError).code === "cancelled";
}

export interface UseAiChatStateOptions {
  desktop: boolean;
  projectPath: string | null;
  aiKeyConfigured: boolean;
  setView: (view: View) => void;
  setInspectorOpen: (open: boolean | ((value: boolean) => boolean)) => void;
  setSidePanelTab: (tab: SidePanelTab) => void;
  monitorLatest: import("../domain/types").MonitorSample | null;
  monitorAlerts: MonitorAlert[];
  artifactFindings: ArtifactFinding[];
  scan: ScanResult | null;
  refreshMonitorAlerts: () => Promise<void>;
  setProcessesNonce: React.Dispatch<React.SetStateAction<number>>;
  showToast: (message: string) => void;
}

export function useAiChatState({
  desktop,
  projectPath,
  aiKeyConfigured,
  setView,
  setInspectorOpen,
  setSidePanelTab,
  monitorLatest,
  monitorAlerts,
  artifactFindings,
  scan,
  refreshMonitorAlerts,
  setProcessesNonce,
  showToast,
}: UseAiChatStateOptions) {
  const [aiChatStore, setAiChatStore] = useState<AiChatStore>(() => loadChatStore(chatScopeKey(null)));
  const [aiChatSending, setAiChatSending] = useState(false);
  const [aiChatError, setAiChatError] = useState<AiError | null>(null);
  const [aiChatRechecking, setAiChatRechecking] = useState(false);

  const aiChatStoreRef = useRef(aiChatStore);
  aiChatStoreRef.current = aiChatStore;
  const chatScopeRef = useRef(chatScopeKey(projectPath));
  const aiSendGenerationRef = useRef(0);

  const patchChatStore = useCallback((updater: (store: AiChatStore) => AiChatStore) => {
    setAiChatStore((previous) => {
      const next = updater(previous);
      saveChatStore(chatScopeRef.current, next);
      return next;
    });
  }, []);

  const aiChatActiveThread = useMemo(() => getActiveThread(aiChatStore), [aiChatStore]);
  const aiChatMessages = aiChatActiveThread?.messages ?? [];
  const aiChatThreads = aiChatStore.threads;
  const aiChatActiveThreadId = aiChatStore.activeThreadId;

  useEffect(() => {
    const scope = chatScopeKey(projectPath);
    if (scope !== chatScopeRef.current) {
      saveChatStore(chatScopeRef.current, aiChatStoreRef.current);
      chatScopeRef.current = scope;
    }
    setAiChatError(null);
    void loadChatStorePersisted(scope).then(setAiChatStore);
  }, [projectPath]);

  const createNewAiChatThread = useCallback(() => {
    patchChatStore((store) => createNewThread(store));
    setAiChatError(null);
  }, [patchChatStore]);

  const selectAiChatThread = useCallback(
    (threadId: string) => {
      patchChatStore((store) => selectThread(store, threadId));
      setAiChatError(null);
    },
    [patchChatStore],
  );

  const deleteAiChatThread = useCallback(
    (threadId: string) => {
      patchChatStore((store) => deleteThread(store, threadId));
      setAiChatError(null);
    },
    [patchChatStore],
  );

  const setAiChatThreadPinned = useCallback(
    (threadId: string, pinned: boolean) => {
      patchChatStore((store) => updateThread(store, threadId, { pinned }));
    },
    [patchChatStore],
  );

  const setAiChatThreadArchived = useCallback(
    (threadId: string, archived: boolean) => {
      patchChatStore((store) => updateThread(store, threadId, { archived }));
    },
    [patchChatStore],
  );

  const renameAiChatThread = useCallback(
    (threadId: string, title: string) => {
      patchChatStore((store) => renameThread(store, threadId, title));
    },
    [patchChatStore],
  );

  const clearAiChat = useCallback(() => {
    patchChatStore((store) => clearActiveThreadMessages(store));
    setAiChatError(null);
  }, [patchChatStore]);

  const openAiSettings = useCallback(() => {
    setView("settings");
  }, [setView]);

  const sendExplainContext = useCallback(
    async (draft: AiChatDraft, options?: { reuseThread?: boolean }) => {
      if (!desktop) return;
      setSidePanelTab("chat");
      setInspectorOpen(true);
      setAiChatError(null);
      patchChatStore((store) =>
        options?.reuseThread ? setActiveExplainSource(store, draft) : beginExplainThread(store, draft),
      );
      if (!aiKeyConfigured) {
        setAiChatError({
          code: "noKey",
          message: import.meta.env.DEV
            ? "Add an API key in Settings, or use mock AI below for local testing."
            : "Save an API key under Settings → AI & Privacy before sending.",
        });
        return;
      }
      if (aiChatSending) return;
      const userContent = composeContextText(draft.items);
      if (!userContent.trim()) return;
      const priorMessages = getActiveThread(aiChatStoreRef.current)?.messages ?? [];
      const sendGeneration = ++aiSendGenerationRef.current;
      const userMsg: AiChatMessage = {
        id: newChatMessageId(),
        role: "user",
        content: userContent,
        createdAtMs: Date.now(),
        kind: "context",
        sourceLabel: draft.sourceLabel,
      };
      patchChatStore((store) =>
        appendMessagesToActive(store, [userMsg], { explainSource: draft, title: draft.sourceLabel }),
      );
      setAiChatSending(true);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      try {
        const contextForApi = buildDiagnosisContextFromThread(priorMessages, userContent);
        const result = await aiDiagnose(contextForApi);
        if (sendGeneration !== aiSendGenerationRef.current) return;
        const assistantMsg: AiChatMessage = {
          id: newChatMessageId(),
          role: "assistant",
          content: formatDiagnosisForChat(result),
          createdAtMs: Date.now(),
          kind: "context",
          diagnosis: result,
          anchors: draft.anchors,
        };
        patchChatStore((store) => appendMessagesToActive(store, [assistantMsg], { explainSource: draft }));
      } catch (cause) {
        if (sendGeneration !== aiSendGenerationRef.current) return;
        if (isCancelledError(cause)) return;
        const error =
          typeof cause === "object" && cause && "code" in cause
            ? (cause as AiError)
            : { code: "providerMessage" as const, message: errorMessage(cause) };
        setAiChatError(error);
      } finally {
        if (sendGeneration === aiSendGenerationRef.current) {
          setAiChatSending(false);
        }
      }
    },
    [aiChatSending, aiKeyConfigured, desktop, patchChatStore, setInspectorOpen, setSidePanelTab],
  );

  const openDiagnosisFromAlert = useCallback(
    (alert: MonitorAlert) => {
      void sendExplainContext({
        sourceKind: "alert",
        sourceId: alert.id,
        sourceLabel: alert.title,
        items: buildAlertContextItems({ alert, latestSample: monitorLatest }),
        anchors: { projectPath, artifacts: artifactFindings },
      });
    },
    [artifactFindings, monitorLatest, projectPath, sendExplainContext],
  );

  const openDiagnosisFromFinding = useCallback(
    (finding: DiagnosticFinding) => {
      void sendExplainContext({
        sourceKind: "finding",
        sourceId: finding.id,
        sourceLabel: finding.title,
        items: buildFindingContextItems(finding),
        anchors: { projectPath, finding, artifacts: artifactFindings },
      });
    },
    [artifactFindings, projectPath, sendExplainContext],
  );

  const openDiagnosisFromArtifact = useCallback(
    (item: ArtifactFinding) => {
      void sendExplainContext({
        sourceKind: "artifact",
        sourceId: item.relativePath,
        sourceLabel: item.relativePath,
        items: buildArtifactContextItems(item),
        anchors: { projectPath, artifact: item, artifacts: artifactFindings },
      });
    },
    [artifactFindings, projectPath, sendExplainContext],
  );

  const openDiagnosisFromProcess = useCallback(
    (input: {
      pid: number;
      name: string;
      command?: string;
      cwd?: string | null;
      cpuPercent?: number;
      memoryBytes?: number;
      tcpPorts?: number[];
      matchedProjectPath?: string | null;
    }) => {
      void sendExplainContext({
        sourceKind: "process",
        sourceId: String(input.pid),
        sourceLabel: `${input.name} (PID ${input.pid})`,
        items: buildProcessContextItems(input),
        anchors: {
          projectPath,
          process: {
            pid: input.pid,
            name: input.name,
            command: input.command,
            ports: input.tcpPorts,
          },
        },
      });
    },
    [projectPath, sendExplainContext],
  );

  const sendAiChatMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !desktop) return;
      if (!aiKeyConfigured) {
        setAiChatError({
          code: "noKey",
          message: import.meta.env.DEV
            ? "Add an API key in Settings, or use mock AI below for local testing."
            : "Save an API key under Settings → AI & Privacy before sending.",
        });
        return;
      }
      if (aiChatSending) return;
      const sendGeneration = ++aiSendGenerationRef.current;
      const userMsg: AiChatMessage = {
        id: newChatMessageId(),
        role: "user",
        content: trimmed,
        createdAtMs: Date.now(),
        kind: "chat",
      };
      const priorMessages = getActiveThread(aiChatStoreRef.current)?.messages ?? [];
      patchChatStore((store) => appendMessagesToActive(ensureActiveThread(store), [userMsg]));
      setAiChatSending(true);
      setAiChatError(null);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      try {
        const turns = buildChatTurnsForApi([...priorMessages, userMsg]);
        const reply = await aiChat(turns);
        if (sendGeneration !== aiSendGenerationRef.current) return;
        const assistantMsg: AiChatMessage = {
          id: newChatMessageId(),
          role: "assistant",
          content: reply,
          createdAtMs: Date.now(),
          kind: "chat",
        };
        patchChatStore((store) => appendMessagesToActive(store, [assistantMsg]));
      } catch (cause) {
        if (sendGeneration !== aiSendGenerationRef.current) return;
        if (isCancelledError(cause)) return;
        const error =
          typeof cause === "object" && cause && "code" in cause
            ? (cause as AiError)
            : { code: "providerMessage" as const, message: errorMessage(cause) };
        setAiChatError(error);
      } finally {
        if (sendGeneration === aiSendGenerationRef.current) {
          setAiChatSending(false);
        }
      }
    },
    [aiChatSending, aiKeyConfigured, desktop, patchChatStore],
  );

  const cancelAiChatRequest = useCallback(() => {
    aiSendGenerationRef.current += 1;
    setAiChatSending(false);
    if (desktop) void aiCancelInflight();
  }, [desktop]);

  const rebuildChatDraftItems = useCallback(
    (draft: AiChatDraft): AiContextItem[] => {
      switch (draft.sourceKind) {
        case "alert": {
          const alert = monitorAlerts.find((entry) => entry.id === draft.sourceId);
          if (!alert) return draft.items;
          return buildAlertContextItems({ alert, latestSample: monitorLatest });
        }
        case "finding": {
          const finding = scan?.findings.find((entry) => entry.id === draft.sourceId);
          if (!finding) return draft.items;
          return buildFindingContextItems(finding);
        }
        case "artifact": {
          const item = artifactFindings.find((entry) => entry.relativePath === draft.sourceId);
          if (!item) return draft.items;
          return buildArtifactContextItems(item);
        }
        case "process": {
          const pid = Number(draft.sourceId);
          if (!Number.isFinite(pid) || !draft.anchors.process) return draft.items;
          return buildProcessContextItems({ ...draft.anchors.process, pid });
        }
        default:
          return draft.items;
      }
    },
    [artifactFindings, monitorAlerts, monitorLatest, scan?.findings],
  );

  const recheckChatDraft = useCallback(async () => {
    const explainSource = getActiveThread(aiChatStoreRef.current)?.explainSource;
    if (!explainSource) return;
    setAiChatRechecking(true);
    try {
      if (desktop) {
        await refreshMonitorAlerts();
        setProcessesNonce((value) => value + 1);
      }
      const items = rebuildChatDraftItems(explainSource);
      await sendExplainContext({ ...explainSource, items }, { reuseThread: true });
    } catch {
      // keep prior messages
    } finally {
      setAiChatRechecking(false);
    }
  }, [desktop, rebuildChatDraftItems, refreshMonitorAlerts, sendExplainContext, setProcessesNonce]);

  const stopProcessForDiagnosis = useCallback(
    async (pid: number) => {
      if (!desktop) return;
      await terminateProcess(pid);
      showToast(`Sent stop to PID ${pid}`);
      setProcessesNonce((value) => value + 1);
    },
    [desktop, showToast, setProcessesNonce],
  );

  return {
    aiChatThreads,
    aiChatActiveThreadId,
    aiChatMessages,
    aiChatSending,
    aiChatError,
    setAiChatError,
    aiChatRechecking,
    createNewAiChatThread,
    selectAiChatThread,
    deleteAiChatThread,
    setAiChatThreadPinned,
    setAiChatThreadArchived,
    renameAiChatThread,
    clearAiChat,
    openAiSettings,
    sendExplainContext,
    openDiagnosisFromAlert,
    openDiagnosisFromFinding,
    openDiagnosisFromArtifact,
    openDiagnosisFromProcess,
    sendAiChatMessage,
    cancelAiChatRequest,
    recheckChatDraft,
    stopProcessForDiagnosis,
  };
}
