import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SettingsAccountPage } from "./SettingsAccountPage";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "1",
      name: "Ada",
      email: "ada@example.com",
      role: "user",
      preferences: { theme: "system", language: "en", sendOnEnter: true },
    },
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

vi.mock("@/services/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    me: { update: vi.fn() },
    auth: { changePassword: vi.fn() },
  },
}));

describe("SettingsAccountPage", () => {
  it("renders profile and change-password forms", () => {
    render(
      <MemoryRouter>
        <SettingsAccountPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Change password" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Security" })).toBeInTheDocument();
    expect(
      screen.getByText(/Two-factor authentication is not part of this release/),
    ).toBeInTheDocument();
  });
});
