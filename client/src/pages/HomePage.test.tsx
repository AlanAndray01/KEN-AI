import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { HomePage } from "./HomePage";

vi.mock("@/services/api", () => ({
  api: {
    health: {
      get: vi.fn().mockResolvedValue({
        status: "ok",
        timestamp: "2026-08-15T00:00:00.000Z",
        service: "aether-api",
        database: { status: "not_configured" },
      }),
    },
  },
}));

function renderHome(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("HomePage", () => {
  it("renders the Aether product name", () => {
    renderHome();
    expect(screen.getByRole("heading", { name: /private AI workspace/i })).toBeInTheDocument();
  });
});
