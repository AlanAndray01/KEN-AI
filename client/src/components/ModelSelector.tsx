import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { AUTO_MODEL_ID, AUTO_PROVIDER_ID, isAutoSelection, type PublicAIModel } from "@Ken/shared";
import { AutoModeIcon } from "@/components/AutoModeIcon";
import { cn } from "@/utils/cn";

interface ModelSelectorProps {
  models: PublicAIModel[];
  providerId: string;
  modelId: string;
  onChange: (providerId: string, modelId: string) => void;
  disabled?: boolean;
  loading?: boolean;
  onAddModel?: () => void;
}

const AUTO_LABEL = "Auto";

/**
 * Tinted with the accent token rather than a fixed colour, so the mark follows
 * the theme. The control carries its own label, so the icon stays decorative.
 */
const AUTO_ICON_CLASS = "size-6 shrink-0 text-accent";

export function ModelSelector({
  models,
  providerId,
  modelId,
  onChange,
  disabled = false,
  loading = false,
  onAddModel,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const auto = isAutoSelection(providerId, modelId);

  const selected = useMemo(
    () =>
      auto ? undefined : (models.find((model) => model.providerId === providerId && model.id === modelId) ?? models[0]),
    [auto, modelId, models, providerId],
  );
  const label = auto ? AUTO_LABEL : selected?.name;

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

  if (models.length === 0 && !loading) {
    return <span className="text-sm text-fg-muted">No model available</span>;
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? "model-selector-listbox" : undefined}
        aria-label={label ? `Select model: ${label}` : "Select model"}
        className="model-selector-trigger inline-flex max-w-[16rem] items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-surface-muted disabled:opacity-60"
        onClick={() => setOpen((value) => !value)}
      >
        {auto ? <AutoModeIcon className={AUTO_ICON_CLASS} /> : null}
        <span className="truncate">{label ?? "Select model"}</span>
        <ChevronDown className="size-4 shrink-0 text-fg-muted" />
      </button>
      {open ? (
        <ul
          id="model-selector-listbox"
          role="listbox"
          aria-label="Models"
          className="model-selector-menu absolute top-full right-0 z-20 mt-1 max-h-80 w-72 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg"
        >
          <li className="px-1 py-1">
            <button
              type="button"
              role="option"
              aria-selected={auto}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-muted",
                auto && "bg-surface-muted",
              )}
              onClick={() => {
                onChange(AUTO_PROVIDER_ID, AUTO_MODEL_ID);
                setOpen(false);
              }}
            >
              <Check className={cn("mt-0.5 size-4 shrink-0", auto ? "opacity-100" : "opacity-0")} />
              <span>
                <span className="flex items-center gap-1.5 font-medium">
                  <AutoModeIcon className={AUTO_ICON_CLASS} />
                  {AUTO_LABEL}
                </span>
                <span className="block text-xs text-fg-muted">Picks the best available model for each message</span>
              </span>
            </button>
          </li>
          {grouped.map(([groupId, groupModels]) => (
            <li key={groupId} className="px-1 py-1">
              <div className="px-2 py-1 text-[11px] font-medium tracking-wide text-fg-muted uppercase">
                {groupId}
              </div>
              {groupModels.map((model) => {
                const active = !auto && model.providerId === selected?.providerId && model.id === selected.id;
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
          {onAddModel ? (
            <li className="border-t border-border px-1 py-1">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-muted"
                onClick={() => {
                  setOpen(false);
                  onAddModel();
                }}
              >
                <Plus className="size-4" />
                Add model / API key
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
