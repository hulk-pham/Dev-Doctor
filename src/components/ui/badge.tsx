import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

const tones = {
  error: "bg-danger/12 text-danger",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/12 text-info",
  pass: "bg-success/15 text-success",
  neutral: "bg-panel-2 text-muted",
};

export function Badge({
  tone,
  children,
  className,
}: {
  tone: keyof typeof tones;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}
