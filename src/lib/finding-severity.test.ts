import { describe, expect, it } from "vitest";
import type { DiagnosticFinding } from "../domain/types";
import { findingRowAccent, findingTone } from "./finding-severity";

const base: DiagnosticFinding = {
  id: "t",
  category: "runtime",
  title: "Test",
  status: "fail",
  severity: "error",
  explanation: "",
  evidence: [],
  recommendedAction: "",
};

describe("findingTone", () => {
  it("maps pass status to pass tone", () => {
    expect(findingTone({ ...base, status: "pass", severity: "error" })).toBe("pass");
  });

  it("maps error severity", () => {
    expect(findingTone(base)).toBe("error");
  });
});

describe("findingRowAccent", () => {
  it("includes left border for each tone", () => {
    expect(findingRowAccent("error")).toContain("border-l-danger");
    expect(findingRowAccent("warning")).toContain("border-l-warning");
  });
});
