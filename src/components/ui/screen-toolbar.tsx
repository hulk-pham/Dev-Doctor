import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { filterToolbar } from "../../lib/ui-layout";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export function ScreenToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(filterToolbar, "min-h-10 items-center", className)}>{children}</div>
  );
}

export function ToolbarGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-1.5", className)}>{children}</div>;
}

/** Right cluster: status time, then icon actions. */
export function ToolbarEnd({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("ml-auto flex shrink-0 flex-wrap items-center gap-1.5", className)}>{children}</div>;
}

export function ToolbarIconButton({
  icon: Icon,
  label,
  className,
  ...props
}: {
  icon: LucideIcon;
  label: string;
  className?: string;
} & Omit<ComponentProps<typeof Button>, "children" | "size">) {
  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      title={label}
      aria-label={label}
      className={className}
      {...props}
    >
      <Icon size={15} aria-hidden />
    </Button>
  );
}

export function ToolbarStatus({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("text-[11px] tabular-nums text-muted", className)}>{children}</span>;
}
