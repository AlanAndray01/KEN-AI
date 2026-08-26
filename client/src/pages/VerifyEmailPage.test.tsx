import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VerifyEmailPage } from "./VerifyEmailPage";

const mocks = vi.hoisted(() => ({
  verifyEmail: vi.fn(),
  resendCode: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    verifyEmail: mocks.verifyEmail,
    resendCode: mocks.resendCode,
  }),
}));

vi.mock("@/stores/toastStore", () => ({
  toast: mocks.toast,
}));

describe("VerifyEmailPage", () => {
  beforeEach(() => {
    mocks.verifyEmail.mockReset();
    mocks.resendCode.mockReset();
    mocks.toast.mockReset();
  });

  it("submits the six-digit code and shows a success toast", async () => {
    mocks.verifyEmail.mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={["/verify-email?email=ada@example.com"]}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/chat" element={<p>Chat</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Enter the 6-digit code" })).toBeInTheDocument();
    fireEvent.paste(screen.getByLabelText("Digit 1 of 6"), {
      clipboardData: { getData: () => "123456" },
    });

    await waitFor(() => {
      expect(mocks.verifyEmail).toHaveBeenCalledWith("ada@example.com", "123456");
    });
    expect(mocks.toast).toHaveBeenCalledWith("Email verified. You're signed in.", "success");
    expect(await screen.findByText("Chat")).toBeInTheDocument();
  });
});
