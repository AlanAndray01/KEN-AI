import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SharePage } from "./SharePage";

vi.mock("@/services/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    share: {
      get: vi.fn().mockResolvedValue({
        readOnly: true,
        conversation: {
          title: "Shared notes",
          createdAt: "2026-01-01T00:00:00.000Z",
          messages: [{ role: "user", content: "Hello shared", createdAt: "2026-01-01T00:00:00.000Z" }],
        },
      }),
    },
  },
}));

describe("SharePage", () => {
  it("renders a read-only shared conversation", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/share/abc"]}>
          <Routes>
            <Route path="/share/:token" element={<SharePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Shared notes" })).toBeInTheDocument();
    expect(screen.getByText("Hello shared")).toBeInTheDocument();
    expect(screen.getByText(/Sending messages is disabled/)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Send message" })).not.toBeInTheDocument();
  });
});
