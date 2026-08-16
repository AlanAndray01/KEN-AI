import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { GptsPage } from "./GptsPage";

vi.mock("@/services/api", () => ({
  api: {
    gpts: {
      list: vi.fn().mockResolvedValue({
        gpts: [
          {
            id: "g1",
            name: "Writer",
            description: "Editing help",
            conversationStarters: [],
            knowledgeFileIds: [],
            capabilities: [],
            creatorId: "u1",
            visibility: "public",
            category: "writing",
            mine: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    },
  },
}));

describe("GptsPage", () => {
  it("renders the GPT store", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <GptsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "GPTs" })).toBeInTheDocument();
    expect(await screen.findByText("Writer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create a GPT" })).toBeInTheDocument();
  });
});
