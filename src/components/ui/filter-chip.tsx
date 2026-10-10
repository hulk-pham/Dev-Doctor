import { cn } from "../../lib/utils";

export function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-lg border px-2.5 text-[13px]",
        active ? "border-accent bg-accent/15 text-text" : "border-border bg-panel-2 text-muted hover:text-text",
      )}
    >
      {label}
    </button>
  );
}
