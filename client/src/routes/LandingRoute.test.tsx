import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LandingRoute } from "./LandingRoute";

const auth = vi.hoisted(() => ({ state: { user: null as unknown, isLoading: false } }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => auth.state,
}));

function renderLanding(): void {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<LandingRoute />} />
        <Route path="/login" element={<p>sign in form</p>} />
        <Route path="/chat" element={<p>chat workspace</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LandingRoute", () => {
  it("sends a signed-out visitor to the sign-in form", () => {
    auth.state = { user: null, isLoading: false };
    renderLanding();
    expect(screen.getByText("sign in form")).toBeInTheDocument();
  });

  it("sends a signed-in visitor straight to chat", () => {
    auth.state = { user: { id: "1" }, isLoading: false };
    renderLanding();
    expect(screen.getByText("chat workspace")).toBeInTheDocument();
  });

  it("waits for the session before redirecting", () => {
    // Redirecting mid-load would bounce a signed-in visitor through the sign-in
    // form for a frame.
    auth.state = { user: null, isLoading: true };
    renderLanding();
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.queryByText("sign in form")).toBeNull();
  });
});
