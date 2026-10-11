/**
 * AI settings + Keychain IPC — extracted from AppState for easier testing and navigation.
 * Chat thread state remains in AppState until a follow-up split.
 */
import { useCallback, useState } from "react";
import type { AiDiagnosisResponse, AiKeyStatus, AiSettings } from "../ai/types";
import { errorMessage } from "../lib/utils";
import {
  aiKeyDelete,
  aiKeySave,
  aiKeyStatus as fetchAiKeyStatus,
  aiDiagnose,
  aiSettingsSave,
  aiTestConnection,
} from "../services/tauri";

export interface UseAiSettingsStateOptions {
  desktop: boolean;
  showToast: (message: string) => void;
}

export function useAiSettingsState({ desktop, showToast }: UseAiSettingsStateOptions) {
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [aiKeyStatus, setAiKeyStatus] = useState<AiKeyStatus | null>(null);

  const refreshAiKeyStatus = useCallback(async () => {
    if (!desktop) return;
    try {
      setAiKeyStatus(await fetchAiKeyStatus());
    } catch {
      setAiKeyStatus({ configured: false, provider: aiSettings?.provider ?? "openai" });
    }
  }, [desktop, aiSettings?.provider]);

  const saveAiSettings = useCallback(
    async (next: AiSettings) => {
      if (!desktop) return;
      const saved = await aiSettingsSave(next);
      setAiSettings(saved);
      try {
        setAiKeyStatus(await fetchAiKeyStatus());
      } catch {
        setAiKeyStatus({ configured: false, provider: saved.provider });
      }
    },
    [desktop],
  );

  const enableDevMockAi = useCallback(async () => {
    if (!import.meta.env.DEV || !desktop) return;
    await saveAiSettings({ provider: "fake", model: "fake-model", baseUrl: null });
    showToast("Mock AI enabled — no Keychain or network");
  }, [desktop, saveAiSettings, showToast]);

  const saveAiKey = useCallback(
    async (apiKey: string) => {
      if (!desktop) return;
      const status = await aiKeySave(apiKey);
      setAiKeyStatus(status);
      const ollama = aiSettings?.provider === "ollama";
      if (!status.configured && !ollama) {
        throw new Error("The key was not stored. Try again or check Keychain Access for Dev Doctor.");
      }
      showToast(apiKey.trim() ? "API key saved to Keychain" : "Using Ollama without a stored key");
    },
    [aiSettings?.provider, desktop, showToast],
  );

  const deleteAiKey = useCallback(async () => {
    if (!desktop) return;
    setAiKeyStatus(await aiKeyDelete());
    showToast("API key removed");
  }, [desktop, showToast]);

  const testAiConnection = useCallback(async () => {
    if (!desktop) return;
    try {
      await aiTestConnection();
      showToast("AI connection OK");
    } catch (cause) {
      showToast(errorMessage(cause));
      throw cause;
    }
  }, [desktop, showToast]);

  const runAiDiagnosis = useCallback(
    async (contextText: string): Promise<AiDiagnosisResponse> => {
      if (!desktop) throw new Error("AI diagnosis runs in the desktop app.");
      return aiDiagnose(contextText);
    },
    [desktop],
  );

  const aiKeyConfigured = Boolean(aiKeyStatus?.configured);

  return {
    aiSettings,
    setAiSettings,
    aiKeyStatus,
    aiKeyConfigured,
    refreshAiKeyStatus,
    saveAiSettings,
    enableDevMockAi,
    saveAiKey,
    deleteAiKey,
    testAiConnection,
    runAiDiagnosis,
  };
}
