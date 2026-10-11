import { Copy } from "lucide-react";
import { useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { cn, errorMessage } from "../lib/utils";
import { useAppState } from "../state/AppState";
import type { ThemePreference } from "../state/settings";

function ruleLabel(id: string): string {
  const labels: Record<string, string> = {
    "cpu-high": "Sustained high CPU",
    "memory-growth": "Rising dev process memory",
    "low-disk": "Low disk space",
    "long-running-dev": "Long-running dev process",
    "watched-port": "Watched port in use",
    "artifact-growth": "Artifact total grew between scans",
  };
  return labels[id] ?? id;
}

function ruleHint(id: string): string {
  const hints: Record<string, string> = {
    "cpu-high": "Default ≥85% for 3 samples.",
    "memory-growth": "Never labeled as a leak.",
    "low-disk": "Default below 10 GB available.",
    "long-running-dev": "Default 24 h for dev processes.",
    "watched-port": "Default ports 3000 and 5173.",
    "artifact-growth": "Compares last two scan totals per project.",
  };
  return hints[id] ?? "";
}

const THEMES: Array<{ id: ThemePreference; label: string }> = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "system", label: "System" },
];

export function SettingsPage() {
  const state = useAppState();
  const [keyDraft, setKeyDraft] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Preferences stay on this Mac. Dev Doctor does not send telemetry.</p>

      <section className="rounded-xl border border-border bg-panel p-4">
        <h2 className="text-sm font-medium">Theme</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => state.updateSettings({ ...state.settings, theme: theme.id })}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm",
                state.settings.theme === theme.id ? "border-accent bg-accent/15" : "border-border text-muted",
              )}
            >
              {theme.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-panel p-4">
        <h2 className="text-sm font-medium">Resource monitoring</h2>
        <p className="mt-1 text-sm text-muted">
          Samples CPU, memory pressure, disk space, and dev processes on an interval. History is stored locally in SQLite when available.
        </p>
        {state.monitorStatus?.storageDegraded || state.monitorStorageStatus?.degraded ? (
          <p className="mt-2 text-[11px] text-warning">
            Database unavailable — monitoring still runs in memory only.
            {state.monitorStorageStatus?.message ? ` ${state.monitorStorageStatus.message}` : null}
          </p>
        ) : null}
        <label className="mt-3 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={state.monitorSettings?.enabled ?? false}
            disabled={!state.desktop}
            onChange={(event) => {
              const current = state.monitorSettings;
              void state.saveMonitorSettings({
                enabled: event.target.checked,
                intervalSeconds: current?.intervalSeconds ?? 5,
                rules: current?.rules ?? [],
                retentionDays: current?.retentionDays ?? 30,
              });
            }}
          />
          <span>Enable background monitoring</span>
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-muted">Sample interval (seconds)</span>
          <input
            type="number"
            min={2}
            max={60}
            className="mt-1 w-24 rounded-lg border border-border bg-panel-2 px-2 py-1 font-mono text-sm"
            value={state.monitorSettings?.intervalSeconds ?? 5}
            disabled={!state.desktop}
            onChange={(event) => {
              const interval = Number(event.target.value);
              if (!Number.isFinite(interval)) return;
              void state.saveMonitorSettings({
                enabled: state.monitorSettings?.enabled ?? false,
                intervalSeconds: interval,
                rules: state.monitorSettings?.rules ?? [],
                retentionDays: state.monitorSettings?.retentionDays ?? 30,
              });
            }}
          />
        </label>
        {state.monitorSettings?.rules?.length ? (
          <ul className="mt-4 space-y-2 text-sm">
            {state.monitorSettings.rules.map((rule) => (
              <li key={rule.id} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={rule.enabled}
                  disabled={!state.desktop}
                  onChange={(event) => {
                    const rules = (state.monitorSettings?.rules ?? []).map((entry) =>
                      entry.id === rule.id ? { ...entry, enabled: event.target.checked } : entry,
                    );
                    void state.saveMonitorSettings({
                      enabled: state.monitorSettings?.enabled ?? false,
                      intervalSeconds: state.monitorSettings?.intervalSeconds ?? 5,
                      rules,
                      retentionDays: state.monitorSettings?.retentionDays ?? 30,
                    });
                  }}
                />
                <span>
                  <span className="font-medium">{ruleLabel(rule.id)}</span>
                  <span className="mt-0.5 block text-[11px] text-muted">{ruleHint(rule.id)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <label className="mt-3 block text-sm">
          <span className="text-muted">Keep hourly aggregates (days)</span>
          <input
            type="number"
            min={7}
            max={90}
            className="mt-1 w-24 rounded-lg border border-border bg-panel-2 px-2 py-1 font-mono text-sm"
            value={state.monitorSettings?.retentionDays ?? 30}
            disabled={!state.desktop}
            onChange={(event) => {
              const days = Number(event.target.value);
              if (!Number.isFinite(days)) return;
              void state.saveMonitorSettings({
                enabled: state.monitorSettings?.enabled ?? false,
                intervalSeconds: state.monitorSettings?.intervalSeconds ?? 5,
                rules: state.monitorSettings?.rules ?? [],
                retentionDays: days,
              });
            }}
          />
        </label>
        <p className="mt-1 text-[11px] text-muted">Raw samples 24 h, minute buckets 7 d, then hourly until this limit.</p>
        <Button
          className="mt-3"
          size="sm"
          variant="danger"
          disabled={!state.desktop}
          onClick={() => {
            if (!window.confirm("Delete all stored monitoring samples and alert history on this Mac?")) return;
            void state.clearMonitorHistory();
          }}
        >
          Clear monitoring data
        </Button>
      </section>

      <section className="min-w-0 rounded-xl border border-border bg-panel p-4">
        <h2 className="text-sm font-medium">AI &amp; Privacy</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          OpenAI BYOK. Requests run from Rust; your key stays in Keychain, not in settings or the webview.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted break-words">
          Host{" "}
          <span className="font-mono text-text">api.openai.com</span> after you confirm the context preview. Paths and logs are opt-in.
        </p>

        <div className="mt-4 min-w-0 overflow-hidden rounded-lg border border-border">
          <label className="block border-b border-border px-3 py-2.5">
            <span className="text-[11px] uppercase tracking-wide text-muted">Model</span>
            <input
              className="mt-1.5 h-8 w-full rounded-lg border border-border bg-panel-2 px-2 font-mono text-[13px]"
              value={state.aiSettings?.model ?? "gpt-4o-mini"}
              disabled={!state.desktop}
              onChange={(event) => {
                void state.saveAiSettings({
                  provider: "openai",
                  model: event.target.value,
                });
              }}
            />
          </label>
          <div className="px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wide text-muted">API key</span>
              <Badge tone={state.aiKeyStatus?.configured ? "pass" : "neutral"}>
                {state.aiKeyStatus?.configured ? "In Keychain" : "Not set"}
              </Badge>
            </div>
            <input
              type="password"
              autoComplete="off"
              className="mt-1.5 h-8 w-full rounded-lg border border-border bg-panel-2 px-2 font-mono text-[13px]"
              placeholder={state.aiKeyStatus?.configured ? "Paste to replace" : "sk-…"}
              value={keyDraft}
              disabled={!state.desktop || aiBusy}
              onChange={(event) => setKeyDraft(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border bg-panel-2/40 px-3 py-2.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={!state.desktop || aiBusy || !keyDraft.trim()}
              onClick={() => {
                const draft = keyDraft.trim();
                setAiBusy(true);
                setAiMessage(null);
                void state
                  .saveAiKey(draft)
                  .then(() => setKeyDraft(""))
                  .catch((cause) => setAiMessage(errorMessage(cause)))
                  .finally(() => setAiBusy(false));
              }}
            >
              Save key
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!state.desktop || aiBusy || !state.aiKeyStatus?.configured}
              onClick={() => {
                setAiBusy(true);
                setAiMessage(null);
                void state
                  .testAiConnection()
                  .catch((cause) => setAiMessage(errorMessage(cause)))
                  .finally(() => setAiBusy(false));
              }}
            >
              Test connection
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:bg-danger/10"
              disabled={!state.desktop || aiBusy || !state.aiKeyStatus?.configured}
              onClick={() => {
                if (!window.confirm("Remove the stored API key from Keychain?")) return;
                setAiBusy(true);
                setAiMessage(null);
                void state
                  .deleteAiKey()
                  .then(() => setKeyDraft(""))
                  .catch((cause) => setAiMessage(errorMessage(cause)))
                  .finally(() => setAiBusy(false));
              }}
            >
              Delete key
            </Button>
          </div>
        </div>
        {aiMessage ? <p className="mt-2 text-[11px] text-danger break-words">{aiMessage}</p> : null}
      </section>

      <section className="rounded-xl border border-border bg-panel p-4">
        <h2 className="text-sm font-medium">Default scan behavior</h2>
        <label className="mt-3 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={state.settings.scanOnSelect}
            onChange={(event) => state.updateSettings({ ...state.settings, scanOnSelect: event.target.checked })}
          />
          <span>
            Scan immediately after a project is selected.
            <span className="mt-1 block text-muted">The scan is read-only. Fixes still wait for confirmation.</span>
          </span>
        </label>
      </section>

      <section className="rounded-xl border border-border bg-panel p-4">
        <h2 className="text-sm font-medium">Local data</h2>
        <p className="mt-2 break-all font-mono text-xs text-muted">{state.dataDirectory ?? "Available in the desktop app."}</p>
        {state.dataDirectory ? (
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => void state.copyText(state.dataDirectory ?? "", "Copied path")}>
            <Copy size={13} />
            Copy path
          </Button>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-panel p-4 text-sm">
        <h2 className="font-medium">Privacy</h2>
        <p className="mt-2 text-muted">
          Dev Doctor reads the project you select and the toolchain commands it needs. Environment files are reduced to variable names.
          Values are not shown, logged, or saved. Scan history stays in the local data folder above. There is no account and no telemetry.
          Optional AI calls reach <span className="font-mono">api.openai.com</span> only after you preview and confirm the context.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-panel p-4">
        <h2 className="text-sm font-medium">Version</h2>
        <p className="mt-1 font-mono text-sm">{state.appVersion}</p>
        <p className="mt-2 text-sm text-muted">
          Check for Updates looks up the latest GitHub release. It does not send project files.
        </p>
        <Button className="mt-3" size="sm" variant="secondary" disabled={state.updateChecking} onClick={() => void state.checkForUpdates(true)}>
          {state.updateChecking ? "Checking…" : "Check for updates"}
        </Button>
      </section>
    </div>
  );
}
