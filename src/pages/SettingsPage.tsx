import { Copy } from "lucide-react";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { useAppState } from "../state/AppState";
import type { ThemePreference } from "../state/settings";

const THEMES: Array<{ id: ThemePreference; label: string }> = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "system", label: "System" },
];

export function SettingsPage() {
  const state = useAppState();

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
        </p>
      </section>

      <section className="rounded-xl border border-border bg-panel p-4">
        <h2 className="text-sm font-medium">Version</h2>
        <p className="mt-1 font-mono text-sm">{state.appVersion}</p>
      </section>
    </div>
  );
}
