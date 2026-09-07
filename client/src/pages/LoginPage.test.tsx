import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";

const login = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    login,
    register: vi.fn(),
    logout: vi.fn(),
    user: null,
    isLoading: false,
  }),
}));

vi.mock("@/services/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    auth: {
      googleStartUrl: "http://localhost:5000/api/auth/google",
    },
  },
}));

describe("LoginPage", () => {
  it("renders Google continue and sign-in tabs", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      "http://localhost:5000/api/auth/google",
    );
    expect(screen.getByRole("navigation", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("sends an unverified account to the verify screen instead of chat", async () => {
    login.mockResolvedValue({
      requiresVerification: true,
      email: "ada@example.com",
      emailSent: true,
    });

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify-email" element={<div>Verify email screen</div>} />
          <Route path="/chat" element={<div>Chat screen</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret1" } });
    fireEvent.submit(screen.getByRole("form", { name: "Sign in" }));

    expect(await screen.findByText("Verify email screen")).toBeInTheDocument();
    expect(screen.queryByText("Chat screen")).not.toBeInTheDocument();
  });

  it("toggles password visibility", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
  });
});
