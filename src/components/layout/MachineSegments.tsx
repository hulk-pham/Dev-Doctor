import { cn } from "../../lib/utils";

export type MachineTab = "processes" | "trends" | "alerts";

export function MachineSegments({
  tab,
  activeAlertCount,
  onChange,
}: {
  tab: MachineTab;
  activeAlertCount: number;
  onChange: (tab: MachineTab) => void;
}) {
  const tabs: Array<{ id: MachineTab; label: string }> = [
    { id: "processes", label: "Processes" },
    { id: "trends", label: "Trends" },
    { id: "alerts", label: activeAlertCount > 0 ? `Alerts (${activeAlertCount})` : "Alerts" },
  ];

  return (
    <nav className="-mb-px flex gap-1 border-b border-border" aria-label="Machine sections">
      {tabs.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "border-b-2 px-3 py-2 text-[13px] transition-colors",
            tab === item.id ? "border-accent text-text" : "border-transparent text-muted hover:text-text",
          )}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
