import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchPage } from "./SearchPage";
import { useUiStore } from "@/stores/uiStore";

vi.mock("@/services/api", () => ({
  api: {
    conversations: {
      list: vi.fn().mockResolvedValue({
        conversations: [
          {
            id: "c1",
            title: "Hello?",
            providerId: "groq",
            modelId: "openai/gpt-oss-20b",
            pinned: false,
            archived: false,
            createdAt: "2026-08-20T00:00:00.000Z",
            updatedAt: "2026-08-20T00:00:00.000Z",
            lastMessageAt: "2026-08-20T00:00:00.000Z",
          },
        ],
      }),
    },
  },
}));

describe("SearchPage", () => {
  beforeEach(() => {
    useUiStore.setState({ chatFilter: "" });
  });

  it("filters conversation titles and links into chat", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <SearchPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "History" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Hello?" })).toHaveAttribute("href", "/chat/c1");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search chats" }), { target: { value: "nope" } });
    expect(screen.queryByRole("link", { name: "Hello?" })).not.toBeInTheDocument();
    expect(screen.getByText("No chats match that title.")).toBeInTheDocument();
  });
});
