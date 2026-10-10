import { describe, expect, it } from "vitest";
import { workspaceNextStep } from "./workspace-next-step";
import type { ScanResult } from "./types";

function scan(errors: number, warnings = 0): ScanResult {
  return {
    id: "1",
    scannedAt: new Date().toISOString(),
    project: { path: "/p", name: "p", projectType: "node" },
    summary: { passed: 0, warnings, errors, infos: 0 },
    findings: [],
    health: "attention",
    meta: {
      isSample: false,
      gitRepo: false,
      gitBranch: null,
      gitDirty: null,
      nodeVersion: null,
      packageManager: "npm",
      packageManagerVersion: null,
      enginesNode: null,
      dependenciesInstalled: "unknown",
      nodeModulesExists: false,
    },
  };
}

describe("workspaceNextStep", () => {
  it("prioritizes errors over cleanup and warnings", () => {
    const step = workspaceNextStep(scan(2, 3), 200 * 1024 * 1024, true);
    expect(step.kind).toBe("errors");
  });

  it("suggests cleanup when bytes are large and there are no errors", () => {
    const step = workspaceNextStep(scan(0, 1), 150 * 1024 * 1024, true);
    expect(step.kind).toBe("cleanup");
  });

  it("asks for scan when a project is selected but not scanned", () => {
    expect(workspaceNextStep(null, null, true).kind).toBe("scan");
  });
});
