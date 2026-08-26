import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SettingsModelsPage } from "./SettingsModelsPage";

vi.mock("@/services/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    models: {
      list: vi.fn().mockResolvedValue({
        models: [
          {
            id: "gemini-2.5-flash",
            providerId: "gemini",
            name: "Gemini 2.5 Flash",
            capabilities: ["text", "streaming"],
            enabled: true,
            available: true,
          },
        ],
      }),
    },
    me: {
      credentials: {
        list: vi.fn().mockResolvedValue({ credentials: [] }),
        test: vi.fn(),
        remove: vi.fn(),
      },
    },
    settings: {
      saveKey: vi.fn(),
    },
  },
}));

describe("SettingsModelsPage", () => {
  it("renders models from GET /api/models", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <SettingsModelsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Gemini 2.5 Flash")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "API Keys & Models" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test Connection" })).toBeInTheDocument();
    expect(screen.getByText(/Google AI Studio \/ Gemini is not in this catalog/)).toBeInTheDocument();
  });
});
