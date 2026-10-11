import type { AiDiagnosisResponse } from "./types";

export function formatDiagnosisForChat(response: AiDiagnosisResponse): string {
  const lines = [
    response.summary,
    "",
    `Confidence: ${response.confidence}`,
  ];
  if (response.evidence.length) {
    lines.push("", "Evidence:", ...response.evidence.map((line) => `• ${line}`));
  }
  if (response.possibleCauses.length) {
    lines.push("", "Possible causes:", ...response.possibleCauses.map((line) => `• ${line}`));
  }
  if (response.recommendedSteps.length) {
    lines.push("", "Suggested steps:");
    for (const step of response.recommendedSteps) {
      lines.push(`• (${step.risk}) ${step.step}`);
    }
  }
  if (response.verification.trim()) {
    lines.push("", `Verify: ${response.verification}`);
  }
  return lines.join("\n");
}
