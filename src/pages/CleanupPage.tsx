import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { canDeleteArtifact, type ArtifactCategory, type ArtifactFinding } from "../diagnostics/artifacts";
import { errorMessage, formatBytes } from "../lib/utils";
import { useAppState } from "../state/AppState";
import { Button } from "../components/ui/button";
import { insetBar, stack, stickyFooter } from "../lib/ui-layout";
import { cn } from "../lib/utils";

const GROUPS: ArtifactCategory[] = [
  "dependencies",
  "build-output",
  "cache",
  "test-report",
  "temporary",
  "worktree",
  "branch",
];

const GROUP_LABEL: Record<ArtifactCategory, string> = {
  dependencies: "Dependencies",
  "build-output": "Build output",
  cache: "Caches",
  "test-report": "Test reports",
  temporary: "Temporary",
  worktree: "Worktrees",
  branch: "Branches not checked out",
};

const DEFAULT_OPEN: Record<ArtifactCategory, boolean> = {
  dependencies: true,
  "build-output": true,
  cache: false,
  "test-report": false,
  temporary: false,
  worktree: false,
  branch: false,
};

export function CleanupPage() {
  const state = useAppState();
  const { artifactFindings, artifactWarnings, artifactError, cleanupListedBytes, scan, removeArtifacts } = state;
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState(DEFAULT_OPEN);
  const rows = artifactFindings;
  const chosen = rows.filter((row) => selected.includes(row.relativePath) && canDeleteArtifact(row));
  const selectedBytes = useMemo(() => chosen.reduce((sum, row) => sum + (row.bytes ?? 0), 0), [chosen]);

  function toggle(path: string) {
    setSelected((current) => (current.includes(path) ? current.filter((item) => item !== path) : [...current, path]));
  }

  async function confirmDelete() {
    setRemoving(true);
    setError(null);
    try {
      await removeArtifacts(chosen.map((row) => row.relativePath));
      setResult(`Removed ${chosen.length} folders · ${formatBytes(chosen.reduce((sum, row) => sum + (row.bytes ?? 0), 0))}`);
      setSelected([]);
      setConfirming(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRemoving(false);
    }
  }

  const needsMeasure = cleanupListedBytes == null && Boolean(scan);

  return (
    <div className={cn(stack, "pb-14")}>
      {artifactError ? <p className="text-sm text-danger">{artifactError}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {result ? <p className="text-[13px] text-success">{result}</p> : null}
      {artifactWarnings.map((warning) => (
        <p key={warning} className="text-[11px] text-warning">
          {warning}
        </p>
      ))}
      {needsMeasure ? (
        <div className={insetBar}>
          <p className="text-[13px] text-muted">Folder sizes are missing from this saved scan.</p>
          <Button size="sm" variant="secondary" className="shrink-0" onClick={() => void state.scanCurrent()}>
            Measure now
          </Button>
        </div>
      ) : null}
      {confirming ? (
        <section className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2">
          <p className="text-[13px] font-medium">Delete selected folders?</p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto font-mono text-[12px]">
            {chosen.map((item) => (
              <li key={item.relativePath}>
                {item.relativePath} · {formatBytes(item.bytes)}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="danger" disabled={removing} onClick={() => void confirmDelete()}>
              {removing ? "Deleting…" : "Confirm delete"}
            </Button>
            <Button size="sm" variant="secondary" disabled={removing} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      {GROUPS.map((category) => {
        const items = rows.filter((row) => row.category === category);
        if (items.length === 0) return null;
        const expanded = openGroups[category];
        return (
          <section key={category} className="overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              className="flex w-full items-center gap-2 border-b border-border bg-panel-2/50 px-3 py-2 text-left text-[13px]"
              onClick={() => setOpenGroups((current) => ({ ...current, [category]: !current[category] }))}
            >
              <ChevronDown size={14} className={cn("text-muted transition-transform", expanded && "rotate-180")} />
              <span className="flex-1">{GROUP_LABEL[category]}</span>
              <span className="text-[11px] text-muted">{items.length}</span>
            </button>
            {expanded ? (
              <ul>
                {items.map((item) => (
                  <CleanupRow key={item.id} item={item} checked={selected.includes(item.relativePath)} onToggle={() => toggle(item.relativePath)} />
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}

      <div className={stickyFooter}>
        <p className="text-[11px] tabular-nums text-muted">
          Listed {cleanupListedBytes != null ? formatBytes(cleanupListedBytes) : "—"}
          {chosen.length > 0 ? ` · Selected ${formatBytes(selectedBytes)} (${chosen.length})` : ""}
        </p>
        <Button size="sm" variant="danger" disabled={chosen.length === 0 || removing} onClick={() => setConfirming(true)}>
          Remove selected
        </Button>
      </div>
    </div>
  );
}

function CleanupRow({ item, checked, onToggle }: { item: ArtifactFinding; checked: boolean; onToggle: () => void }) {
  const state = useAppState();
  const deletable = canDeleteArtifact(item);
  return (
    <li className="border-b border-border px-3 py-2 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <label className="flex min-w-0 items-center gap-2">
          {deletable ? <input type="checkbox" checked={checked} onChange={onToggle} /> : <span className="w-4" />}
          <span className="truncate font-mono text-[12px]">{item.relativePath}</span>
        </label>
        <span className="shrink-0 text-[12px] tabular-nums">{formatBytes(item.bytes)}</span>
      </div>
      <p className="mt-0.5 truncate text-[11px] text-muted">
        {item.safety} · {item.reason}
      </p>
      {state.desktop ? (
        <Button size="sm" variant="secondary" className="mt-1.5" onClick={() => state.openDiagnosisFromArtifact(item)}>
          Explain with AI
        </Button>
      ) : null}
    </li>
  );
}
