import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ChatPage } from "./ChatPage";

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
      list: vi.fn().mockResolvedValue({ conversations: [] }),
      messages: vi.fn().mockResolvedValue({ messages: [] }),
    },
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
    tools: {
      list: vi.fn().mockResolvedValue({
        tools: [
          {
            id: "web_search",
            name: "Web search",
            description: "Search",
            configured: false,
            available: false,
            unavailableReason: "Web search is not configured.",
          },
          {
            id: "image_generation",
            name: "Image generation",
            description: "Generate",
            configured: false,
            available: false,
            unavailableReason: "Image generation is not configured.",
          },
          {
            id: "data_analysis",
            name: "Data analysis",
            description: "Analyze",
            configured: false,
            available: false,
            unavailableReason: "Isolated data-analysis sandbox is not configured.",
          },
        ],
      }),
    },
    voice: {
      status: vi.fn().mockResolvedValue({
        sttConfigured: false,
        ttsConfigured: false,
        message: "Voice is not configured.",
      }),
    },
    gpts: {
      list: vi.fn().mockResolvedValue({ gpts: [] }),
      get: vi.fn().mockResolvedValue({ gpt: null }),
    },
  },
}));

describe("ChatPage", () => {
  it("renders the composer", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/chat"]}>
          <Routes>
            <Route path="/chat" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Chat" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Send message" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Messages" })).toHaveAttribute("aria-live", "polite");
  });
});
