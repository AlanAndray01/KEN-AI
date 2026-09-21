import { cn } from "@/utils/cn";
import type { MentionCandidate } from "@/utils/mentions";

export function ComposerMentions({
  items,
  activeIndex,
  onChoose,
}: {
  items: MentionCandidate[];
  activeIndex: number;
  onChoose: (item: MentionCandidate) => void;
}) {
  return (
    <ul
      id="composer-mentions"
      role="listbox"
      aria-label="Mention a GPT"
      className="mx-3 mb-2 max-h-48 overflow-y-auto rounded-xl border border-border bg-canvas py-1"
    >
      {items.map((item, index) => (
        <li key={item.id}>
          <button
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={cn(
              "flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-surface-muted",
              index === activeIndex && "bg-surface-muted",
            )}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChoose(item)}
          >
            <span className="font-medium">@{item.name}</span>
            {item.description ? <span className="text-xs text-fg-muted">{item.description}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
