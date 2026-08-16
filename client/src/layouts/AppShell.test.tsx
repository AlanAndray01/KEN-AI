import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "@/layouts/AppShell";

describe("AppShell", () => {
  it("exposes a skip-to-content link", () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<main id="main-content">Hello</main>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveAttribute("href", "#main-content");
    expect(document.getElementById("main-content")).toBeTruthy();
  });
});
