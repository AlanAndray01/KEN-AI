import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SettingsMemoryPage } from "./SettingsMemoryPage";

vi.mock("@/services/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    memories: {
      list: vi.fn().mockResolvedValue({
        memories: [
          {
            id: "m1",
            content: "Prefers TypeScript",
            source: "manual",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  },
}));

describe("SettingsMemoryPage", () => {
  it("lists saved memories", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <SettingsMemoryPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Memory" })).toBeInTheDocument();
    expect(await screen.findByText("Prefers TypeScript")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Add memory" })).toBeInTheDocument();
  });
});
