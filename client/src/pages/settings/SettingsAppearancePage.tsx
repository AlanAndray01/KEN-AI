import { Link } from "react-router-dom";
import { CLIENT_ROUTES } from "@aether/shared";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useThemeStore } from "@/stores/themeStore";
import { cn } from "@/utils/cn";

const THEMES = [
  {
    value: "light" as const,
    title: "Light",
    description: "Warm paper canvas for daytime use.",
  },
  {
    value: "dark" as const,
    title: "Dark",
    description: "Low-glare workspace for night sessions.",
  },
  {
    value: "system" as const,
    title: "System",
    description: "Follow the operating system color scheme.",
  },
];

export function SettingsAppearancePage() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">Settings</p>
        <h1 className="text-3xl font-semibold tracking-tight">Appearance</h1>
        <p className="text-fg-muted">Choose a light theme, a dark theme, or match your device.</p>
      </div>
      <ThemeToggle />
      <div className="grid gap-3 sm:grid-cols-3">
        {THEMES.map((theme) => {
          const selected = preference === theme.value;
          return (
            <button
              key={theme.value}
              type="button"
              aria-pressed={selected}
              className={cn(
                "rounded-xl border px-4 py-4 text-left",
                selected ? "border-accent bg-surface" : "border-border bg-surface hover:bg-surface-muted",
              )}
              onClick={() => setPreference(theme.value)}
            >
              <div className="font-medium">{theme.title}</div>
              <p className="mt-1 text-sm text-fg-muted">{theme.description}</p>
            </button>
          );
        })}
      </div>
      <Link to={CLIENT_ROUTES.settings} className="text-sm text-accent underline-offset-4 hover:underline">
        Back to settings
      </Link>
    </div>
  );
}
