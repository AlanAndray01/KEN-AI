import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuestRoute } from "./GuestRoute";

const auth = vi.hoisted(() => ({ user: null as { id: string } | null, isLoading: false }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => auth,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<div>Login screen</div>} />
          <Route path="/verify-email" element={<div>Verify screen</div>} />
          <Route path="/reset-password" element={<div>Reset screen</div>} />
        </Route>
        <Route path="/chat" element={<div>Chat screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("GuestRoute", () => {
  beforeEach(() => {
    auth.user = null;
    auth.isLoading = false;
  });

  it("sends a signed-in visitor away from login", () => {
    auth.user = { id: "u1" };
    renderAt("/login");
    expect(screen.getByText("Chat screen")).toBeInTheDocument();
  });

  it("keeps a signed-in visitor on the verify screen so OTP is not skipped", () => {
    auth.user = { id: "u1" };
    renderAt("/verify-email");
    expect(screen.getByText("Verify screen")).toBeInTheDocument();
    expect(screen.queryByText("Chat screen")).not.toBeInTheDocument();
  });
});
