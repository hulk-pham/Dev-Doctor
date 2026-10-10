import type { DiagnosticFinding, PortInspection } from "../domain/types";
import { createFinding } from "./engine";

export function validatePort(value: string): { ok: true; port: number } | { ok: false; reason: string } {
  if (!/^\d+$/.test(value.trim())) {
    return { ok: false, reason: "Enter a whole port number from 1 to 65535." };
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, reason: "Enter a whole port number from 1 to 65535." };
  }
  return { ok: true, port };
}

export function portFinding(inspection: PortInspection): DiagnosticFinding {
  if (inspection.error && !inspection.listening) {
    return createFinding({
      id: `port-${inspection.port}-error`,
      category: "ports",
      severity: "warning",
      status: "unknown",
      title: `Port ${inspection.port} could not be inspected`,
      explanation: "Dev Doctor could not check this port. Nothing was stopped or modified.",
      evidence: [inspection.error],
      recommendedAction: "Confirm lsof is available on macOS and try the port again.",
    });
  }
  if (!inspection.listening) {
    return createFinding({
      id: `port-${inspection.port}-closed`,
      category: "ports",
      severity: "info",
      status: "pass",
      title: `Port ${inspection.port} is not listening`,
      explanation: "No process is accepting TCP connections on this port.",
      evidence: [`Port: ${inspection.port}`, "State: not listening"],
      recommendedAction: "Start the development server if you expected it to be running.",
    });
  }
  const evidence = [
    `Port: ${inspection.port}`,
    `Listeners: ${inspection.listenerCount}`,
    inspection.processName ? `Process: ${inspection.processName}` : "Process name: unavailable",
    inspection.pid != null ? `PID: ${inspection.pid}` : "PID: unavailable",
  ];
  return createFinding({
    id: `port-${inspection.port}-open`,
    category: "ports",
    severity: "info",
    status: "unknown",
    title: `Port ${inspection.port} is in use`,
    explanation:
      "A process is listening on this TCP port. Dev Doctor shows the process name and PID when macOS provides them, and it will not terminate the process.",
    evidence,
    recommendedAction: "Stop the process yourself if it should not be using this port.",
  });
}
