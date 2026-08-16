import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ConversationSidebar } from "./ConversationSidebar";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "1", name: "Ada", email: "ada@example.com", role: "user" },
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("@/services/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    conversations: {
      list: vi.fn().mockResolvedValue({
        conversations: [
          {
            id: "pinned-1",
            title: "Pinned notes",
            modelId: "gemini-2.5-flash",
            providerId: "gemini",
            archived: false,
            pinned: true,
            lastMessageAt: new Date().toISOString(),
            messageCount: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: "today-1",
            title: "Today's research",
            modelId: "gemini-2.5-flash",
            providerId: "gemini",
            archived: false,
            pinned: false,
            lastMessageAt: new Date().toISOString(),
            messageCount: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      }),
      update: vi.fn(),
      remove: vi.fn(),
    },
  },
}));

describe("ConversationSidebar", () => {
  it("renders grouped conversation history", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/chat/today-1"]}>
          <Routes>
            <Route path="/chat/:conversationId" element={<ConversationSidebar />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Pinned" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByText("Pinned notes")).toBeInTheDocument();
    expect(screen.getByText("Today's research")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Conversations" })).toBeInTheDocument();
  });
});
