import { useMemo, useState } from "react";
import { FindingCard } from "../components/FindingCard";
import { FixDialog } from "../components/FixDialog";
import { Button } from "../components/ui/button";
import { CATEGORY_LABELS, CATEGORY_ORDER, type DiagnosticCategory, type DiagnosticFinding, type DiagnosticSeverity, type FixExecutionResult, type FixSuggestion } from "../domain/types";
import { portFinding } from "../diagnostics/ports";
import { cn } from "../lib/utils";
import { useAppState } from "../state/AppState";

const SEVERITIES: Array<DiagnosticSeverity | "all"> = ["all", "error", "warning", "info"];

export function DiagnosticsPage() {
  const state = useAppState();
  const [severity, setSeverity] = useState<DiagnosticSeverity | "all">("all");
  const [category, setCategory] = useState<DiagnosticCategory | "all">("all");
  const [showPassed, setShowPassed] = useState(true);
  const [port, setPort] = useState("3000");
  const [pending, setPending] = useState<FixSuggestion | null>(null);
  const [phase, setPhase] = useState<"confirm" | "running" | "done">("confirm");
  const [result, setResult] = useState<FixExecutionResult | null>(null);

  const portFindings = state.portResult ? [portFinding(state.portResult)] : [];
  const findings = useMemo(() => {
    const source = [...(state.scan?.findings ?? []), ...portFindings];
    return source.filter((finding) => {
      if (!showPassed && finding.status === "pass") return false;
      if (severity !== "all" && finding.severity !== severity) return false;
      if (category !== "all" && finding.category !== category) return false;
      return true;
    });
  }, [state.scan, state.portResult, severity, category, showPassed, portFindings]);

  const grouped = CATEGORY_ORDER.map((id) => ({
    id,
    label: CATEGORY_LABELS[id],
    findings: findings.filter((finding) => finding.category === id),
  })).filter((group) => group.findings.length > 0 || (group.id === "ports" && (category === "all" || category === "ports")));

  function startFix(finding: DiagnosticFinding) {
    if (!finding.fix || finding.fix.kind !== "execute") return;
    setPending(finding.fix);
    setPhase("confirm");
    setResult(null);
  }

  async function confirmFix() {
    if (!pending) return;
    setPhase("running");
    try {
      const next = await state.runConfirmedFix(pending);
      setResult(next);
    } catch (error) {
      setResult({
        ok: false,
        command: "",
        exitCode: null,
        outputTail: "",
        error: error instanceof Error ? error.message : "The fix could not be started.",
      });
    } finally {
      setPhase("done");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Findings stay grouped by the part of the environment they describe.</p>

      {state.scanOrigin === "history" && state.scan ? (
        <p className="rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-muted">
          Viewing a saved scan. Run Scan Project for a fresh result.
        </p>
      ) : null}
      {state.scan?.meta.isSample ? (
        <p className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
          Sample data. These findings come from the bundled fixture, not from invented results.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {SEVERITIES.map((item) => (
          <FilterChip key={item} active={severity === item} onClick={() => setSeverity(item)} label={item === "all" ? "All severities" : item} />
        ))}
        <FilterChip active={showPassed} onClick={() => setShowPassed((value) => !value)} label={showPassed ? "Passed shown" : "Passed hidden"} />
      </div>
      <div className="flex flex-wrap gap-2">
        <FilterChip active={category === "all"} onClick={() => setCategory("all")} label="All categories" />
        {CATEGORY_ORDER.map((item) => (
          <FilterChip key={item} active={category === item} onClick={() => setCategory(item)} label={CATEGORY_LABELS[item]} />
        ))}
      </div>

      {!state.scan && portFindings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-panel px-5 py-10 text-center">
          <h2 className="text-sm font-medium">No scan yet</h2>
          <p className="mt-1 text-sm text-muted">Select a project and run a scan. You can still inspect a port below.</p>
          <Button className="mt-4" onClick={() => void state.scanCurrent()} disabled={state.scanning}>
            {state.scanning ? "Scanning…" : "Scan Project"}
          </Button>
        </div>
      ) : null}

      {grouped.map((group) => (
        <section key={group.id} className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">{group.label}</h2>
          {group.id === "ports" ? (
            <form
              className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-panel p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void state.inspectPortNumber(port);
              }}
            >
              <label className="text-sm">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">TCP port</span>
                <input
                  value={port}
                  onChange={(event) => setPort(event.target.value)}
                  inputMode="numeric"
                  className="h-9 w-28 rounded-lg border border-border bg-panel-2 px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-accent/60"
                />
              </label>
              <Button type="submit" variant="secondary" disabled={state.inspectingPort}>
                {state.inspectingPort ? "Checking…" : "Inspect port"}
              </Button>
              <p className="pb-2 text-xs text-muted">Shows the process name and PID. Dev Doctor will not stop it.</p>
            </form>
          ) : null}
          {group.findings.map((finding) => (
            <FindingCard key={finding.id} finding={finding} onExecute={startFix} />
          ))}
          {group.id === "ports" && group.findings.length === 0 ? (
            <p className="text-sm text-muted">No port has been inspected in this session.</p>
          ) : null}
        </section>
      ))}

      {state.scan && findings.length === 0 ? <p className="text-sm text-muted">No findings match these filters.</p> : null}

      <FixDialog
        suggestion={pending}
        projectPath={state.projectPath}
        phase={phase}
        result={result}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmFix()}
      />
    </div>
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs capitalize",
        active ? "border-accent bg-accent/15 text-text" : "border-border text-muted hover:text-text",
      )}
    >
      {label}
    </button>
  );
}
