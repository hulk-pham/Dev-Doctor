import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface ProcessSample {
  tick: number;
  at: string;
  pid: number;
  startTime: string;
  exePath: string;
  name: string;
  cpuPercent: number | null;
  memoryBytes: number | null;
}

interface SystemSample {
  at: string;
  cpuPercent: number | null;
  memoryPressure: string | null;
  swapBytes: number | null;
  diskFreeBytes: number | null;
}

function load<T>(name: string): T {
  const path = resolve(__dirname, "../../fixtures/monitor", name);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("monitoring fixtures (P0.8)", () => {
  const processes = load<{ samples: ProcessSample[] }>("process-samples.json").samples;
  const system = load<{ samples: SystemSample[] }>("system-series.json").samples;

  it("covers a reused PID as a different identity", () => {
    const pid = 4201;
    const rows = processes.filter((row) => row.pid === pid);
    const identities = new Set(rows.map((row) => `${row.startTime}|${row.exePath}`));
    expect(identities.size).toBeGreaterThan(1);
  });

  it("covers a process that disappears between ticks", () => {
    const pid = 5300;
    const seenTicks = processes.filter((row) => row.pid === pid).map((row) => row.tick);
    const lastSeen = Math.max(...seenTicks);
    const lastTick = Math.max(...processes.map((row) => row.tick));
    expect(lastSeen).toBeLessThan(lastTick);
  });

  it("keeps missing process metrics as null, not zero", () => {
    const missing = processes.filter((row) => row.cpuPercent === null || row.memoryBytes === null);
    expect(missing.length).toBeGreaterThan(0);
    for (const row of missing) {
      expect(row.cpuPercent === 0 || row.memoryBytes === 0).toBe(false);
    }
  });

  it("keeps missing system metrics as null, not zero", () => {
    const missing = system.filter((row) => row.cpuPercent === null || row.memoryPressure === null);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((row) => row.cpuPercent !== 0)).toBe(true);
  });

  it("includes a disk-low sample for the low-disk rule", () => {
    expect(system.some((row) => row.diskFreeBytes !== null && row.diskFreeBytes < 10 * 1024 ** 3)).toBe(true);
  });

  it("includes a sustained high CPU run for the CPU rule", () => {
    const high = system.filter((row) => row.cpuPercent !== null && row.cpuPercent > 85);
    expect(high.length).toBeGreaterThanOrEqual(2);
  });
});
