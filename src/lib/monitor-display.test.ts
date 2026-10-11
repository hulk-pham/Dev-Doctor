import { describe, expect, it } from "vitest";
import { memoryPressureLabel, formatUptimeFromStart } from "./monitor-display";

describe("memoryPressureLabel", () => {
  it("maps vm pressure codes", () => {
    expect(memoryPressureLabel({ vmPressure: 0, statusLevel: null, swapUsedBytes: null, swapTotalBytes: null })).toBe(
      "Normal",
    );
    expect(memoryPressureLabel({ vmPressure: 2, statusLevel: null, swapUsedBytes: null, swapTotalBytes: null })).toBe(
      "Critical",
    );
  });
});

describe("formatUptimeFromStart", () => {
  it("formats minutes from epoch start", () => {
    const now = 1_700_000_000_000;
    expect(formatUptimeFromStart(1_700_000_000 - 120, now)).toBe("2m");
  });
});
