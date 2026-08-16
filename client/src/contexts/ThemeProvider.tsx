import { useEffect, type ReactNode } from "react";
import { applyTheme, useThemeStore } from "@/stores/themeStore";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useThemeStore((state) => state.preference);

  useEffect(() => {
    applyTheme(preference);

    if (preference !== "system") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  return children;
}
