import { describe, expect, it } from "vitest";
import { portFinding, validatePort } from "./ports";

describe("ports", () => {
  it("validates port numbers", () => {
    expect(validatePort("3000")).toEqual({ ok: true, port: 3000 });
    expect(validatePort("0").ok).toBe(false);
    expect(validatePort("65536").ok).toBe(false);
    expect(validatePort("22; kill").ok).toBe(false);
  });

  it("shows the process name and PID without a terminate action", () => {
    const finding = portFinding({
      port: 5173,
      listening: true,
      pid: 4242,
      processName: "node",
      listenerCount: 1,
      error: null,
    });
    expect(finding.evidence).toContain("PID: 4242");
    expect(finding.evidence).toContain("Process: node");
    expect(finding.fix).toBeUndefined();
    expect(finding.recommendedAction.toLowerCase()).not.toContain("kill");
  });

  it("reports a free port and inspection errors", () => {
    expect(portFinding({ port: 9, listening: false, pid: null, processName: null, listenerCount: 0, error: null }).status).toBe(
      "pass",
    );
    expect(
      portFinding({
        port: 9,
        listening: false,
        pid: null,
        processName: null,
        listenerCount: 0,
        error: "lsof was not found on PATH.",
      }).title,
    ).toMatch(/could not be inspected/);
  });
});
