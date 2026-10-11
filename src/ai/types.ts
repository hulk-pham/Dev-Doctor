import type { DiagnosisAnchors } from "./fix-plan";
import type { MonitorAlert, MonitorSample } from "../domain/types";

export type AiProviderId =
  | "openai"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "groq"
  | "together"
  | "openrouter"
  | "azure"
  /** Debug / `tauri dev` only — stripped in release builds. */
  | "fake";

export interface AiSettings {
  provider: AiProviderId;
  model: string;
  /** Ollama / Azure OpenAI resource endpoint. */
  baseUrl?: string | null;
}

export interface AiKeyStatus {
  configured: boolean;
  provider: string;
}

export type AiContextCategory = "metrics" | "alert" | "path" | "log" | "source";

export interface AiContextItem {
  id: string;
  label: string;
  content: string;
  included: boolean;
  category: AiContextCategory;
  /** When true, user must opt in before sending. */
  optIn: boolean;
}

export type AiConfidence = "low" | "medium" | "high";
export type AiStepRisk = "read" | "confirm" | "danger";

export interface AiRecommendedStep {
  step: string;
  risk: AiStepRisk;
}

export interface AiDiagnosisResponse {
  summary: string;
  evidence: string[];
  possibleCauses: string[];
  confidence: AiConfidence;
  recommendedSteps: AiRecommendedStep[];
  verification: string;
}

export type AiErrorCode =
  | "noKey"
  | "network"
  | "timeout"
  | "rateLimit"
  | "unsupportedModel"
  | "invalidSchema"
  | "contextTooLarge"
  | "unsupportedProvider"
  | "providerMessage"
  | "cancelled";

export interface AiError {
  code: AiErrorCode;
  message: string;
}

export interface AlertContextInput {
  alert: MonitorAlert;
  latestSample?: MonitorSample | null;
}

export type DiagnosisSourceKind = "alert" | "finding" | "artifact" | "process";

export interface AiChatDraft {
  sourceKind: DiagnosisSourceKind;
  sourceId: string;
  sourceLabel: string;
  items: AiContextItem[];
  anchors: DiagnosisAnchors;
}

export type AiChatMessageKind = "chat" | "context";

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAtMs: number;
  kind?: AiChatMessageKind;
  sourceLabel?: string;
  diagnosis?: AiDiagnosisResponse;
  anchors?: DiagnosisAnchors;
}

export interface AiChatThread {
  id: string;
  title: string;
  createdAtMs: number;
  updatedAtMs: number;
  messages: AiChatMessage[];
  explainSource: AiChatDraft | null;
  pinned?: boolean;
  archived?: boolean;
}
