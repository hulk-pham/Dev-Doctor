import type { DiagnosisAnchors } from "./fix-plan";
import type { MonitorAlert, MonitorSample } from "../domain/types";

export type AiProviderId = "openai";

export interface AiSettings {
  provider: AiProviderId;
  model: string;
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
  | "providerMessage";

export interface AiError {
  code: AiErrorCode;
  message: string;
}

export interface AlertContextInput {
  alert: MonitorAlert;
  latestSample?: MonitorSample | null;
  projectPath?: string | null;
}

export type DiagnosisSourceKind = "alert" | "finding" | "artifact" | "process";

export interface DiagnosisSession {
  sourceKind: DiagnosisSourceKind;
  /** Stable id for recheck (alert id, finding id, artifact path, or pid string). */
  sourceId: string;
  sourceLabel: string;
  items: AiContextItem[];
  anchors: DiagnosisAnchors;
  result: AiDiagnosisResponse | null;
  error: AiError | null;
  sending: boolean;
  baselineContext: string | null;
  afterContext: string | null;
  rechecking: boolean;
}
