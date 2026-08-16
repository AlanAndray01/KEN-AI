import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemePreference } from "@aether/shared";
import { useThemeStore } from "@/stores/themeStore";
import { cn } from "@/utils/cn";

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function nextPreference(preference: ThemePreference): ThemePreference {
  if (preference === "light") return "dark";
  if (preference === "dark") return "system";
  return "light";
}

interface ThemeToggleProps {
  compact?: boolean;
}

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const current = OPTIONS.find((option) => option.value === preference) ?? {
    value: "system" as const,
    label: "System",
    icon: Monitor,
  };
  const next = OPTIONS.find((option) => option.value === nextPreference(preference)) ?? current;
  const CurrentIcon = current.icon;

  if (compact) {
    return (
      <button
        type="button"
        className="rounded-lg p-2 text-fg-muted hover:bg-surface-muted hover:text-fg"
        aria-label={`Theme: ${preference}. Switch to ${next.label.toLowerCase()}`}
        onClick={() => setPreference(next.value)}
      >
        <CurrentIcon className="size-4" />
      </button>
    );
  }

  return (
    <div className="inline-flex rounded-xl border border-border bg-surface p-1" role="group" aria-label="Theme">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm",
              selected ? "bg-surface-muted font-medium" : "text-fg-muted hover:text-fg",
            )}
            onClick={() => setPreference(option.value)}
          >
            <Icon className="size-4" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
