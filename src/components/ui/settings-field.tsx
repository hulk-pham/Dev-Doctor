import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

/** Bordered stack for Settings sections (monitoring, AI, etc.). */
export function SettingsFieldGroup({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("min-w-0 overflow-hidden rounded-lg border border-border divide-y divide-border", className)}>
      {children}
    </div>
  );
}

const inputClass =
  "mt-1.5 h-8 w-full max-w-[8.5rem] rounded-lg border border-border bg-panel-2 px-2 font-mono text-[13px] tabular-nums text-text";

export function SettingsNumberField({
  label,
  unit,
  hint,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  unit?: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const title = unit ? `${label} (${unit})` : label;
  return (
    <label className="block px-3 py-2.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{title}</span>
      {hint ? <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{hint}</p> : null}
      <input
        type="number"
        min={min}
        max={max}
        disabled={disabled}
        className={inputClass}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          onChange(next);
        }}
      />
    </label>
  );
}

export function SettingsTextField({
  label,
  hint,
  value,
  disabled,
  type = "text",
  placeholder,
  mono = true,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  disabled?: boolean;
  type?: "text" | "password";
  placeholder?: string;
  mono?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block px-3 py-2.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      {hint ? <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{hint}</p> : null}
      <input
        type={type}
        autoComplete={type === "password" ? "off" : undefined}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "mt-1.5 h-8 w-full rounded-lg border border-border bg-panel-2 px-2 text-[13px] text-text",
          mono && "font-mono",
        )}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function SettingsFieldActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2 bg-panel-2/40 px-3 py-2.5">{children}</div>;
}

/** Settings dropdown (not native `<select>`). */
export function SettingsSelectField<T extends string>({
  label,
  hint,
  value,
  disabled,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  disabled?: boolean;
  options: Array<{ id: T; label: string }>;
  onChange: (id: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const activeLabel = options.find((item) => item.id === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={root} className="relative px-3 py-2.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      {hint ? <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{hint}</p> : null}
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        className={cn(
          "mt-1.5 flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-border bg-panel-2 px-2 text-left text-[13px] text-text",
          disabled && "cursor-not-allowed opacity-60",
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">{activeLabel}</span>
        <ChevronDown size={14} className={cn("shrink-0 text-muted", open && "rotate-180")} />
      </button>
      {open && !disabled ? (
        <ul className="absolute left-3 right-3 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-panel py-1 shadow-lg">
          {options.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={cn(
                  "block w-full px-2 py-1.5 text-left text-[12px] hover:bg-hover",
                  value === item.id && "bg-active text-text",
                )}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
