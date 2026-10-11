import { describe, expect, it } from "vitest";
import { parseAiDiagnosisResponse } from "./response-schema";

describe("response-schema", () => {
  it("accepts a valid diagnosis object", () => {
    const parsed = parseAiDiagnosisResponse({
      summary: "CPU spike likely from a dev server.",
      evidence: ["90% CPU"],
      possibleCauses: ["Heavy webpack build"],
      confidence: "medium",
      recommendedSteps: [{ step: "Inspect Processes.", risk: "read" }],
      verification: "Check CPU after stopping the process.",
    });
    expect(parsed.confidence).toBe("medium");
  });

  it("rejects missing summary", () => {
    expect(() =>
      parseAiDiagnosisResponse({
        summary: "  ",
        evidence: [],
        possibleCauses: [],
        confidence: "low",
        recommendedSteps: [],
        verification: "x",
      }),
    ).toThrow(/summary/i);
  });
});
