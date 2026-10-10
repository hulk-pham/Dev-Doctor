import { Button } from "./button";

export function SegmentedFilter<T extends string>({
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (id: T) => void;
  "aria-label"?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex shrink-0 flex-wrap items-center gap-1.5">
      {options.map((item) => (
        <Button
          key={item.id}
          type="button"
          size="sm"
          variant={value === item.id ? "default" : "secondary"}
          aria-pressed={value === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}
