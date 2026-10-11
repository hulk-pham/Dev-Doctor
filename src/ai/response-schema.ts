import type { AiConfidence, AiDiagnosisResponse, AiRecommendedStep, AiStepRisk } from "./types";

const CONFIDENCE: AiConfidence[] = ["low", "medium", "high"];
const RISKS: AiStepRisk[] = ["read", "confirm", "danger"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`Field "${field}" must be a string array.`);
  }
  return value;
}

function parseStep(value: unknown): AiRecommendedStep {
  if (!isRecord(value) || typeof value.step !== "string" || typeof value.risk !== "string") {
    throw new Error("Each recommended step needs step and risk strings.");
  }
  if (!RISKS.includes(value.risk as AiStepRisk)) {
    throw new Error(`Step risk must be one of: ${RISKS.join(", ")}.`);
  }
  return { step: value.step, risk: value.risk as AiStepRisk };
}

export function parseAiDiagnosisResponse(value: unknown): AiDiagnosisResponse {
  if (!isRecord(value)) {
    throw new Error("Diagnosis response must be an object.");
  }
  if (typeof value.summary !== "string" || !value.summary.trim()) {
    throw new Error('Diagnosis response needs a non-empty "summary".');
  }
  if (typeof value.verification !== "string") {
    throw new Error('Diagnosis response needs "verification".');
  }
  if (typeof value.confidence !== "string" || !CONFIDENCE.includes(value.confidence as AiConfidence)) {
    throw new Error(`"confidence" must be ${CONFIDENCE.join(", ")}.`);
  }
  const recommendedSteps = Array.isArray(value.recommendedSteps)
    ? value.recommendedSteps.map(parseStep)
    : [];
  return {
    summary: value.summary,
    evidence: asStringArray(value.evidence, "evidence"),
    possibleCauses: asStringArray(value.possibleCauses, "possibleCauses"),
    confidence: value.confidence as AiConfidence,
    recommendedSteps,
    verification: value.verification,
  };
}
