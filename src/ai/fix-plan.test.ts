import { describe, expect, it } from "vitest";
import { planDiagnosisSteps } from "./fix-plan";
import type { AiDiagnosisResponse } from "./types";
import type { ArtifactFinding } from "../diagnostics/artifacts";

const artifact: ArtifactFinding = {
  id: "a1",
  relativePath: "node_modules",
  category: "dependencies",
  safety: "reproducible",
  kind: "directory",
  bytes: 100,
  modifiedMs: null,
  lastCommitMs: null,
  truncated: false,
  countsInTotal: true,
  technologies: ["node"],
  reason: "Dependencies folder",
  consequence: "Reinstall with npm install",
};

function response(steps: AiDiagnosisResponse["recommendedSteps"]): AiDiagnosisResponse {
  return {
    summary: "Test",
    evidence: ["CPU high"],
    possibleCauses: ["Dev server"],
    confidence: "medium",
    recommendedSteps: steps,
    verification: "Check CPU again.",
  };
}

describe("fix-plan", () => {
  it("maps a deletable artifact when step names the path and risk is confirm", () => {
    const planned = planDiagnosisSteps(
      response([{ step: "Remove node_modules and reinstall.", risk: "confirm" }]),
      { projectPath: "/Users/dev/app", artifact },
    );
    expect(planned[0]?.action).toBe("deleteArtifact");
    expect(planned[0]?.executable).toBe(true);
  });

  it("refuses delete when risk is read", () => {
    const planned = planDiagnosisSteps(
      response([{ step: "Delete node_modules.", risk: "read" }]),
      { projectPath: "/Users/dev/app", artifact },
    );
    expect(planned[0]?.action).toBe("text");
    expect(planned[0]?.refusedReason).toMatch(/confirm/);
  });

  it("refuses danger steps", () => {
    const planned = planDiagnosisSteps(
      response([{ step: "Run rm -rf /", risk: "danger" }]),
      { projectPath: "/Users/dev/app" },
    );
    expect(planned[0]?.executable).toBe(false);
    expect(planned[0]?.refusedReason).toMatch(/dangerous/);
  });

  it("maps stop process when pid is anchored", () => {
    const planned = planDiagnosisSteps(
      response([{ step: "Stop process 4242 to free CPU.", risk: "confirm" }]),
      { projectPath: null, process: { pid: 4242, name: "node" } },
    );
    expect(planned[0]?.action).toBe("stopProcess");
    expect(planned[0]?.payload?.pid).toBe(4242);
  });
});
