import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { SettingsAppearancePage } from "./SettingsAppearancePage";
import { useThemeStore } from "@/stores/themeStore";

describe("SettingsAppearancePage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useThemeStore.setState({ preference: "system" });
  });

  it("switches between light, dark, and system themes", () => {
    render(
      <MemoryRouter>
        <SettingsAppearancePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Appearance" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(useThemeStore.getState().preference).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(useThemeStore.getState().preference).toBe("light");
  });
});
