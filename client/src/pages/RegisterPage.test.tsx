import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterPage } from "./RegisterPage";

const register = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    login: vi.fn(),
    register,
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

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={["/register"]}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<div>Verify email screen</div>} />
        <Route path="/chat" element={<div>Chat screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RegisterPage", () => {
  beforeEach(() => {
    register.mockReset();
  });

  it("sends email sign-up to the verify screen and never into chat", async () => {
    register.mockResolvedValue({
      requiresVerification: true,
      email: "ada@example.com",
      emailSent: true,
    });

    renderRegister();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret1" } });
    fireEvent.submit(screen.getByRole("form", { name: "Create account" }));

    expect(await screen.findByText("Verify email screen")).toBeInTheDocument();
    expect(screen.queryByText("Chat screen")).not.toBeInTheDocument();
  });

  it("stays on register when verification email cannot be sent", async () => {
    const { ApiError } = await import("@/services/api");
    register.mockRejectedValue(new ApiError("Email verification is temporarily unavailable. Try again later.", {
      status: 503,
      code: "EMAIL_UNAVAILABLE",
    }));

    renderRegister();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret1" } });
    fireEvent.submit(screen.getByRole("form", { name: "Create account" }));

    expect(
      await screen.findByText("Email verification is temporarily unavailable. Try again later."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Chat screen")).not.toBeInTheDocument();
    expect(screen.queryByText("Verify email screen")).not.toBeInTheDocument();
  });
});
