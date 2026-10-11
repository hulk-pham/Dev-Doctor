export function ChatQuickPrompts({
  prompts,
  disabled,
  onSelect,
}: {
  prompts: string[];
  disabled: boolean;
  onSelect: (text: string) => void;
}) {
  if (!prompts.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          disabled={disabled}
          className="rounded-full border border-border bg-panel-2 px-2.5 py-1 text-[11px] text-text hover:bg-hover disabled:opacity-50"
          onClick={() => onSelect(prompt)}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
