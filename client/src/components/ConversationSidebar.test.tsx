import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationSidebar } from "./ConversationSidebar";
import { useUiStore } from "@/stores/uiStore";

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

function renderSidebar(): void {
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
}

describe("ConversationSidebar", () => {
  it("renders grouped conversation history", async () => {
    renderSidebar();

    expect(await screen.findByRole("heading", { name: "Pinned" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByText("Pinned notes")).toBeInTheDocument();
    expect(screen.getByText("Today's research")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Conversations" })).toBeInTheDocument();
  });

  describe("with the desktop rail collapsed", () => {
    // `collapsed` persists in localStorage, so a session that ever used the
    // desktop icon-rail toggle carries that flag into every future session —
    // including one opened on a phone or tablet, which has no way to reach
    // the (desktop-only) button that clears it. The chat list used to unmount
    // outright whenever this flag was set, on every viewport; it must now
    // stay in the DOM regardless, with only a `md:`-scoped CSS class hiding
    // it on desktop.
    //
    // The store only reads localStorage once, at module-import time, so
    // setting the key here would be too late — the running store's state has
    // already been initialized. Driving `collapsed` through the store's own
    // setState reproduces the same live state a persisted flag would leave
    // the app in, without depending on import order.
    beforeEach(() => {
      useUiStore.setState({ collapsed: true });
    });

    afterEach(() => {
      useUiStore.setState({ collapsed: false });
    });

    it("still renders the conversation list", async () => {
      renderSidebar();

      // The <nav> landmark is unconditional now, so it exists from the first
      // render and would resolve before the mocked fetch settles; wait on the
      // data-dependent text instead, same as the unmodified test above.
      expect(await screen.findByText("Pinned notes")).toBeInTheDocument();
      expect(screen.getByText("Today's research")).toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "Conversations" })).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Filter chats")).toBeInTheDocument();
    });
  });
});
