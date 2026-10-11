import type { MemoryPressureSample, MonitorAlert, MonitorAlertSeverity, MonitorSample } from "../domain/types";
import type { FindingTone } from "./finding-severity";

export function alertSeverityTone(severity: MonitorAlertSeverity): FindingTone {
  if (severity === "error") return "error";
  if (severity === "warning") return "warning";
  return "info";
}

export function alertStateLabel(state: MonitorAlert["state"]): string {
  if (state === "active") return "Active";
  if (state === "recovered") return "Recovered";
  return "Dismissed";
}

export function formatMonitorWhen(atMs: number | null | undefined): string {
  if (atMs == null || !Number.isFinite(atMs)) return "";
  return new Date(atMs).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function memoryPressureLabel(pressure: MemoryPressureSample | null | undefined): string {
  if (!pressure) return "—";
  if (pressure.vmPressure === 2) return "Critical";
  if (pressure.vmPressure === 1) return "Warning";
  if (pressure.vmPressure === 0) return "Normal";
  if (pressure.statusLevel != null) {
    if (pressure.statusLevel < 30) return "Tight";
    if (pressure.statusLevel < 60) return "Moderate";
    return "Comfortable";
  }
  return "Unknown";
}

export function formatUptimeFromStart(startTimeSeconds: number, nowMs = Date.now()): string {
  const elapsed = Math.max(0, Math.floor(nowMs / 1000 - startTimeSeconds));
  const days = Math.floor(elapsed / 86400);
  const hours = Math.floor((elapsed % 86400) / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${elapsed}s`;
}

export function latestSystemLine(sample: MonitorSample | null): string {
  if (!sample) return "No sample yet";
  const cpu = sample.system.cpuPercent != null ? `${sample.system.cpuPercent.toFixed(0)}% CPU` : "CPU —";
  const pressure = memoryPressureLabel(sample.system.memoryPressure);
  const disk =
    sample.disk.availableBytes != null ? `${formatShortBytes(sample.disk.availableBytes)} free` : "Disk —";
  return `${cpu} · ${pressure} · ${disk}`;
}

function formatShortBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(0)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${bytes} B`;
}

export function chartPoints(
  samples: MonitorSample[],
  value: (sample: MonitorSample) => number | null,
): Array<{ x: number; y: number | null }> {
  if (samples.length === 0) return [];
  const start = samples[0]?.atMs ?? 0;
  const end = samples[samples.length - 1]?.atMs ?? start;
  const span = Math.max(end - start, 1);
  return samples.map((sample) => ({
    x: (sample.atMs - start) / span,
    y: value(sample),
  }));
}

export function polylineFromPoints(
  points: Array<{ x: number; y: number | null }>,
  height: number,
  maxY: number,
): string {
  const usable = points.filter((point): point is { x: number; y: number } => point.y != null && Number.isFinite(point.y));
  if (usable.length === 0) return "";
  const scale = maxY > 0 ? maxY : 100;
  return usable
    .map((point, index) => {
      const x = point.x * 100;
      const y = height - (point.y / scale) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
