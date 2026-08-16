import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { PublicAIModel } from "@aether/shared";
import { cn } from "@/utils/cn";

interface ModelSelectorProps {
  models: PublicAIModel[];
  providerId: string;
  modelId: string;
  onChange: (providerId: string, modelId: string) => void;
  disabled?: boolean;
}

export function ModelSelector({ models, providerId, modelId, onChange, disabled = false }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => models.find((model) => model.providerId === providerId && model.id === modelId) ?? models[0],
    [modelId, models, providerId],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, PublicAIModel[]>();
    for (const model of models) {
      const list = map.get(model.providerId) ?? [];
      list.push(model);
      map.set(model.providerId, list);
    }
    return [...map.entries()];
  }, [models]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (models.length === 0) {
    return <span className="text-sm text-fg-muted">No model available</span>;
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Model"
        className="inline-flex max-w-[16rem] items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-surface-muted disabled:opacity-60"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="truncate">{selected?.name ?? "Select model"}</span>
        <ChevronDown className="size-4 shrink-0 text-fg-muted" />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Models"
          className="absolute top-full right-0 z-20 mt-1 max-h-80 w-72 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg"
        >
          {grouped.map(([groupId, groupModels]) => (
            <li key={groupId} className="px-1 py-1">
              <div className="px-2 py-1 text-[11px] font-medium tracking-wide text-fg-muted uppercase">
                {groupId}
              </div>
              {groupModels.map((model) => {
                const active = model.providerId === selected?.providerId && model.id === selected.id;
                return (
                  <button
                    key={`${model.providerId}:${model.id}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-muted",
                      active && "bg-surface-muted",
                    )}
                    onClick={() => {
                      onChange(model.providerId, model.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mt-0.5 size-4 shrink-0", active ? "opacity-100" : "opacity-0")} />
                    <span>
                      <span className="block font-medium">{model.name}</span>
                      <span className="block text-xs text-fg-muted">{model.id}</span>
                    </span>
                  </button>
                );
              })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
