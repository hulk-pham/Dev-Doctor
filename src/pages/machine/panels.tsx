import { ChevronDown } from "lucide-react";
import type { MonitorAlert, MonitorSample } from "../../domain/types";
import {
  alertSeverityTone,
  alertStateLabel,
  formatMonitorWhen,
  memoryPressureLabel,
} from "../../lib/monitor-display";
import { findingRowAccent } from "../../lib/finding-severity";
import { cn, formatBytes } from "../../lib/utils";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";

const CHART_H = 64;

export function CurrentHealth({ latest }: { latest: MonitorSample | null | undefined }) {
  if (!latest) {
    return null;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-border bg-panel px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-muted">CPU</p>
        <p className="mt-1 text-[13px] tabular-nums">{latest.system.cpuPercent != null ? `${latest.system.cpuPercent.toFixed(0)}%` : "—"}</p>
      </div>
      <div className="rounded-lg border border-border bg-panel px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-muted">Memory pressure</p>
        <p className="mt-1 text-[13px]">{memoryPressureLabel(latest.system.memoryPressure)}</p>
      </div>
      <div className="rounded-lg border border-border bg-panel px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-muted">Disk free</p>
        <p className="mt-1 text-[13px] tabular-nums">
          {latest.disk.availableBytes != null ? formatBytes(latest.disk.availableBytes) : "—"}
        </p>
      </div>
    </div>
  );
}

export function TrendsCharts({
  running,
  sampleCount,
  latest,
  cpuLine,
  pressureLine,
  diskLine,
}: {
  running: boolean;
  sampleCount: number;
  latest: MonitorSample | null | undefined;
  cpuLine: string;
  pressureLine: string;
  diskLine: string;
}) {
  if (running && sampleCount === 0) {
    return <p className="text-[11px] text-muted">Collecting the first samples…</p>;
  }
  if (!running && sampleCount === 0) {
    return null;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-panel">
      <MetricChartRow title="CPU" caption={latest?.system.cpuPercent != null ? `${latest.system.cpuPercent.toFixed(0)}% now` : "—"} path={cpuLine} emptyLabel={running ? "Waiting for data" : "—"} />
      <MetricChartRow title="Memory pressure" caption={memoryPressureLabel(latest?.system.memoryPressure)} path={pressureLine} emptyLabel="—" borderTop />
      <MetricChartRow title="Disk available" caption={latest?.disk.availableBytes != null ? formatBytes(latest.disk.availableBytes) : "—"} path={diskLine} emptyLabel="—" borderTop />
    </div>
  );
}

function MetricChartRow({
  title,
  caption,
  path,
  emptyLabel,
  borderTop,
}: {
  title: string;
  caption: string;
  path: string;
  emptyLabel: string;
  borderTop?: boolean;
}) {
  return (
    <div className={cn("px-3 py-2.5", borderTop && "border-t border-border")}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] uppercase tracking-wide text-muted">{title}</p>
        <p className="text-[13px] tabular-nums text-text">{caption}</p>
      </div>
      <svg viewBox={`0 0 100 ${CHART_H}`} className="mt-2 h-16 w-full text-accent" preserveAspectRatio="none" role="img" aria-label={`${title} trend`}>
        <line x1="0" y1={CHART_H - 0.5} x2="100" y2={CHART_H - 0.5} className="stroke-border" strokeWidth="0.5" />
        {path ? <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /> : null}
      </svg>
      {!path && emptyLabel !== "—" ? <p className="mt-1 text-[11px] text-muted">{emptyLabel}</p> : null}
    </div>
  );
}

export type AlertScope = "active" | "history";
export type AlertStateFilter = "all" | "active" | "recovered" | "dismissed";
export type AlertTimeFilter = "24h" | "7d" | "30d" | "all";

export function AlertsList({
  alerts,
  scope,
  focusedId,
  onFocus,
  onDismiss,
  onMute,
  onOpenSettings,
  onExplain,
}: {
  alerts: MonitorAlert[];
  scope: AlertScope;
  focusedId: string | null;
  onFocus: (id: string | null) => void;
  onDismiss: (id: string) => void;
  onMute: (ruleId: string) => void;
  onOpenSettings: () => void;
  onExplain?: (alert: MonitorAlert) => void;
}) {
  const filtered = scope === "active" ? alerts.filter((alert) => alert.state === "active") : alerts;

  if (filtered.length === 0) {
    return (
      <p className="text-[11px] text-muted">
        {scope === "active" ? "No active alerts. Watchdog rules run while sampling is on." : "No alerts match these filters."}{" "}
        <button type="button" className="text-accent hover:underline" onClick={onOpenSettings}>
          Rule settings
        </button>
      </p>
    );
  }

  return (
    <ul className="overflow-hidden rounded-lg border border-border">
      {filtered.map((alert) => (
        <AlertRow
          key={alert.id}
          alert={alert}
          expanded={focusedId === alert.id}
          onToggle={() => onFocus(focusedId === alert.id ? null : alert.id)}
          onDismiss={() => onDismiss(alert.id)}
          onMute={() => onMute(alert.ruleId)}
          onExplain={onExplain ? () => onExplain(alert) : undefined}
        />
      ))}
    </ul>
  );
}

function AlertRow({
  alert,
  expanded,
  onToggle,
  onDismiss,
  onMute,
  onExplain,
}: {
  alert: MonitorAlert;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: () => void;
  onMute: () => void;
  onExplain?: () => void;
}) {
  const tone = alert.state === "active" ? alertSeverityTone(alert.severity) : "info";
  const badgeTone = alert.state === "active" ? alertSeverityTone(alert.severity) : "neutral";

  return (
    <li className={cn("border-b border-border last:border-b-0", alert.state === "active" && findingRowAccent(tone))}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 py-2 pl-2.5 pr-3 text-left hover:bg-panel-2">
        <ChevronDown size={14} className={cn("shrink-0 text-muted transition-transform", expanded && "rotate-180")} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px]">{alert.title}</span>
          <span className="block truncate text-[11px] text-muted">{alert.summary}</span>
        </span>
        <Badge tone={badgeTone}>{alertStateLabel(alert.state)}</Badge>
      </button>
      {expanded ? (
        <div className="space-y-2 border-t border-border bg-panel-2/40 px-3 py-2 text-[13px]">
          <div className="rounded-md bg-panel px-2 py-1.5 font-mono text-[11px] leading-5 text-muted">
            {alert.evidence.length ? alert.evidence.map((line, index) => <div key={`${alert.id}-${index}`}>{line}</div>) : "No evidence recorded."}
          </div>
          <p className="text-[11px] text-muted">Updated {formatMonitorWhen(alert.updatedAtMs)}</p>
          <div className="flex flex-wrap gap-1.5">
            {onExplain ? (
              <Button size="sm" variant="secondary" onClick={onExplain}>
                Explain with AI
              </Button>
            ) : null}
            {alert.state === "active" ? (
              <>
                <Button size="sm" variant="secondary" onClick={onDismiss}>
                  Ignore
                </Button>
                <Button size="sm" variant="secondary" onClick={onMute}>
                  Mute rule
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
