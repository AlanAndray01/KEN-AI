import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SettingsAppearancePage } from "./SettingsAppearancePage";

describe("SettingsAppearancePage", () => {
  it("states that Ken is dark only and offers no theme to switch to", () => {
    render(
      <MemoryRouter>
        <SettingsAppearancePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
    // The palette is dark-only, so there is deliberately nothing to pick.
    expect(screen.queryByRole("button", { name: "Light" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "System" })).not.toBeInTheDocument();
  });
});
