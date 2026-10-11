import { describe, expect, it } from "vitest";
import { clampInspectorWidth, INSPECTOR_WIDTH_DEFAULT, INSPECTOR_WIDTH_MAX, INSPECTOR_WIDTH_MIN } from "./inspector-width";

describe("clampInspectorWidth", () => {
  it("defaults invalid input", () => {
    expect(clampInspectorWidth(Number.NaN)).toBe(INSPECTOR_WIDTH_DEFAULT);
  });

  it("clamps to min and max", () => {
    expect(clampInspectorWidth(INSPECTOR_WIDTH_MIN - 40)).toBe(INSPECTOR_WIDTH_MIN);
    expect(clampInspectorWidth(INSPECTOR_WIDTH_MAX + 100)).toBe(INSPECTOR_WIDTH_MAX);
    expect(clampInspectorWidth(400)).toBe(400);
  });
});
