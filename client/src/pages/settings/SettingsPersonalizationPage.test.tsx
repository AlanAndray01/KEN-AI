import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SettingsPersonalizationPage } from "./SettingsPersonalizationPage";

vi.mock("@/services/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    instructions: {
      get: vi.fn().mockResolvedValue({
        instructions: {
          aboutUser: "Ada",
          howToRespond: "Be brief",
          additional: "",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
      upsert: vi.fn(),
    },
  },
}));

describe("SettingsPersonalizationPage", () => {
  it("loads custom instructions", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <SettingsPersonalizationPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Personalization" })).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Ada")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Custom instructions" })).toBeInTheDocument();
  });
});
