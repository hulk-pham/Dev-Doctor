import { cn } from "../../lib/utils";

export function Switch({
  checked,
  label,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex h-8 shrink-0 items-center gap-2 disabled:opacity-45"
    >
      <span
        className={cn(
          "relative h-[22px] w-10 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-[#d7d7dc]",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-[left]",
            checked ? "left-[20px]" : "left-[2px]",
          )}
        />
      </span>
      <span className="text-[13px] text-text">{label}</span>
    </button>
  );
}
