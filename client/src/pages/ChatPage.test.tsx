import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ChatPage } from "./ChatPage";

const mocks = vi.hoisted(() => ({
  listMessages: vi.fn(),
  feedback: vi.fn(),
  sendChat: vi.fn(),
}));

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
      messages: mocks.listMessages,
      feedback: mocks.feedback,
      send: mocks.sendChat,
      abort: vi.fn().mockResolvedValue({ ok: true, aborted: true }),
      regenerate: mocks.sendChat,
    },
    chat: {
      send: mocks.sendChat,
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
    me: {
      credentials: {
        list: vi.fn().mockResolvedValue({ credentials: [] }),
        test: vi.fn(),
      },
    },
  },
}));

describe("ChatPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.listMessages.mockReset();
    mocks.feedback.mockReset();
    mocks.sendChat.mockReset();
    mocks.listMessages.mockResolvedValue({ messages: [] });
    mocks.sendChat.mockImplementation(async function* () {
      /* idle */
    });
  });

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

  it("shows a streaming placeholder immediately after send, before the first SSE event", async () => {
    let release: () => void = () => undefined;
    // Deliberately yields nothing: this models a stream that has opened but not
    // delivered its first SSE event yet.
    // eslint-disable-next-line require-yield
    mocks.sendChat.mockImplementation(async function* () {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });

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
    const textarea = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(textarea, { target: { value: "Hello there" } });
    fireEvent.submit(screen.getByRole("form", { name: "Send message" }));

    expect(await screen.findByRole("status", { name: "Generating response" })).toBeInTheDocument();
    expect(screen.getByText("Hello there")).toBeInTheDocument();
    release();
  });
});

const assistantMessage = {
  id: "m2",
  conversationId: "c1",
  role: "assistant" as const,
  content: "Hello there",
  status: "complete" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderConversation() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/chat/c1"]}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ChatPage response feedback", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.listMessages.mockReset();
    mocks.feedback.mockReset();
    mocks.sendChat.mockReset();
    mocks.listMessages.mockResolvedValue({ messages: [] });
    mocks.sendChat.mockImplementation(async function* () {
      /* idle */
    });
    mocks.listMessages.mockResolvedValue({ messages: [assistantMessage] });
  });

  it("shows the rating that is already stored on the server", async () => {
    mocks.listMessages.mockResolvedValue({
      messages: [{ ...assistantMessage, feedback: { rating: "down" } }],
    });

    renderConversation();

    expect(await screen.findByRole("button", { name: "Bad response" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
  });

  it("shows a retry card when the last assistant turn failed", async () => {
    mocks.listMessages.mockResolvedValue({
      messages: [{ ...assistantMessage, content: "", status: "error" }],
    });

    renderConversation();

    expect(await screen.findByRole("alert")).toHaveTextContent("Generation failed");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("submits the rating using the id carried by the message, and it survives a refetch", async () => {
    let stored: { rating: "up" | "down" } | undefined;
    mocks.listMessages.mockImplementation(async () => ({
      messages: [{ ...assistantMessage, ...(stored ? { feedback: stored } : {}) }],
    }));
    mocks.feedback.mockImplementation(async (_conversationId, _messageId, body) => {
      stored = body as { rating: "up" | "down" };
      return { message: { ...assistantMessage, feedback: stored } };
    });

    renderConversation();
    fireEvent.click(await screen.findByRole("button", { name: "Good response" }));

    await waitFor(() => {
      expect(mocks.feedback).toHaveBeenCalledWith("c1", "m2", { rating: "up" });
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "true");
    });
    // The refetch triggered by invalidation must not drop the stored rating.
    expect(mocks.listMessages.mock.calls.length).toBeGreaterThan(1);
    expect(screen.getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "true");
  });

  it("rolls the optimistic rating back when the request fails", async () => {
    mocks.feedback.mockRejectedValue(new Error("boom"));

    renderConversation();
    const good = await screen.findByRole("button", { name: "Good response" });
    fireEvent.click(good);

    await waitFor(() => {
      expect(mocks.feedback).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "false");
    });
  });

  it("ignores repeated clicks while a rating is in flight", async () => {
    let release: ((value: unknown) => void) | undefined;
    mocks.feedback.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    renderConversation();
    const good = await screen.findByRole("button", { name: "Good response" });
    fireEvent.click(good);

    await waitFor(() => expect(good).toBeDisabled());
    fireEvent.click(good);
    fireEvent.click(screen.getByRole("button", { name: "Bad response" }));

    expect(mocks.feedback).toHaveBeenCalledOnce();
    release?.({ message: { ...assistantMessage, feedback: { rating: "up" } } });
  });
});
