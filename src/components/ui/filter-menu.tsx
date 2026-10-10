import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export function FilterMenu<T extends string>({
  prefix,
  value,
  options,
  onChange,
  align = "start",
}: {
  prefix: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (id: T) => void;
  /** Popover anchor when the control sits on the right toolbar edge. */
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const active = options.find((item) => item.id === value)?.label ?? value;
  const filtered = value !== options[0]?.id;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={root} className="relative min-w-0">
      <Button
        type="button"
        size="sm"
        variant={filtered ? "default" : "secondary"}
        className="max-w-[14rem] font-normal"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">
          <span className={filtered ? "opacity-80" : "text-muted"}>{prefix}</span> {active}
        </span>
        <ChevronDown size={14} className={cn("shrink-0", filtered ? "opacity-80" : "text-muted")} />
      </Button>
      {open ? (
        <ul
          className={cn(
            "absolute z-20 mt-1 min-w-[12rem] overflow-hidden rounded-lg border border-border bg-panel py-1 shadow-sm",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {options.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={cn(
                  "block w-full px-3 py-1.5 text-left text-[13px] hover:bg-panel-2",
                  value === item.id && "bg-accent/10 text-text",
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
