import { useEffect, useMemo, useState } from "react";
import { CompactFindingRow } from "../components/CompactFindingRow";
import { FixDialog } from "../components/FixDialog";
import { Button } from "../components/ui/button";
import { FilterMenu } from "../components/ui/filter-menu";
import { ScreenToolbar, ToolbarEnd } from "../components/ui/screen-toolbar";
import { SegmentedFilter } from "../components/ui/segmented-filter";
import { stack } from "../lib/ui-layout";
import { CATEGORY_LABELS, CATEGORY_ORDER, type DiagnosticCategory, type DiagnosticFinding, type FixExecutionResult, type FixSuggestion } from "../domain/types";
import { useAppState, type DiagnosticsFocus } from "../state/AppState";

type Focus = "all" | "error" | "warning" | "pass";

const FOCUS_OPTIONS: Array<{ id: Focus; label: string }> = [
  { id: "all", label: "All" },
  { id: "error", label: "Errors" },
  { id: "warning", label: "Warnings" },
  { id: "pass", label: "Passed" },
];

export function DiagnosticsPage() {
  const state = useAppState();
  const [focus, setFocus] = useState<Focus>("all");
  const [category, setCategory] = useState<DiagnosticCategory | "all">("all");
  const [port, setPort] = useState("");
  const [pending, setPending] = useState<FixSuggestion | null>(null);
  const [phase, setPhase] = useState<"confirm" | "running" | "done">("confirm");
  const [result, setResult] = useState<FixExecutionResult | null>(null);

  useEffect(() => {
    const map: Record<DiagnosticsFocus, Focus> = { all: "all", error: "error", warning: "warning", pass: "pass" };
    setFocus(map[state.diagnosticsFocus]);
  }, [state.diagnosticsFocus]);

  const findings = useMemo(() => {
    const source = state.scan?.findings ?? [];
    return source.filter((finding) => {
      if (focus === "pass" && finding.status !== "pass") return false;
      if (focus === "error" && finding.severity !== "error") return false;
      if (focus === "warning" && finding.severity !== "warning") return false;
      if (category !== "all" && finding.category !== category) return false;
      return true;
    });
  }, [state.scan, focus, category]);

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
    <div className={stack}>
      {state.scanOrigin === "history" && state.scan ? (
        <p className="text-[11px] text-muted">Saved scan — run Scan Project on Overview for a fresh result.</p>
      ) : null}
      <ScreenToolbar>
        <SegmentedFilter aria-label="Severity" value={focus} options={FOCUS_OPTIONS} onChange={setFocus} />
        <ToolbarEnd>
          <FilterMenu
            align="end"
            prefix="Category"
            value={category}
            onChange={setCategory}
            options={[
              { id: "all" as const, label: "All" },
              ...CATEGORY_ORDER.map((id) => ({ id, label: CATEGORY_LABELS[id] })),
            ]}
          />
        </ToolbarEnd>
      </ScreenToolbar>

      {!state.scan ? (
        <p className="text-[13px] text-muted">Run Scan Project on Overview first.</p>
      ) : null}

      {grouped.map((group) => (
        <section key={group.id}>
          <h2 className="mb-1 text-[11px] uppercase tracking-wide text-muted">{group.label}</h2>
          {group.id === "ports" ? (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input
                value={port}
                onChange={(event) => setPort(event.target.value)}
                inputMode="numeric"
                placeholder="Port"
                className="h-8 w-[4.25rem] rounded-lg border border-border bg-panel-2 px-2 font-mono text-[13px]"
              />
              <Button type="button" size="sm" variant="secondary" disabled={!port.trim()} onClick={() => state.openProcessesFindPort(port)}>
                Find in Processes
              </Button>
            </div>
          ) : null}
          {group.findings.length > 0 ? (
            <ul className="overflow-hidden rounded-lg border border-border">
              {group.findings.map((finding) => (
                <CompactFindingRow key={finding.id} finding={finding} onExecute={startFix} />
              ))}
            </ul>
          ) : group.id === "ports" ? (
            <p className="text-[11px] text-muted">No port findings in this scan.</p>
          ) : null}
        </section>
      ))}

      {state.scan && findings.length === 0 ? <p className="text-[11px] text-muted">No findings match these filters.</p> : null}

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
