import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordPage } from "./ResetPasswordPage";

const resetPassword = vi.fn();

vi.mock("@/services/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public readonly options?: { status?: number; code?: string },
    ) {
      super(message);
    }
  },
  api: {
    auth: {
      resetPassword: (...args: unknown[]) => resetPassword(...args),
    },
  },
}));

vi.mock("@/stores/toastStore", () => ({
  toast: vi.fn(),
}));

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    resetPassword.mockReset();
  });

  it("shows the server message when the code is invalid or expired", async () => {
    const { ApiError } = await import("@/services/api");
    resetPassword.mockRejectedValue(
      new ApiError("Reset code is invalid or has expired", { status: 400, code: "RESET_TOKEN_INVALID" }),
    );

    render(
      <MemoryRouter initialEntries={["/reset-password?email=ada@example.com"]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/login" element={<div>Login screen</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.paste(screen.getByLabelText("Digit 1 of 6"), {
      clipboardData: { getData: () => "123456" },
    });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "secret1" } });
    fireEvent.submit(screen.getByRole("form", { name: "Reset password" }));

    expect(await screen.findByText("Reset code is invalid or has expired")).toBeInTheDocument();
    expect(screen.queryByText("Login screen")).not.toBeInTheDocument();
  });
});
