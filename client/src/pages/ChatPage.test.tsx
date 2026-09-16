import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { api } from "@/services/api";
import { useModelStore } from "@/stores/modelStore";
import { useToastStore } from "@/stores/toastStore";
import { ChatPage } from "./ChatPage";

const mocks = vi.hoisted(() => ({
  listMessages: vi.fn(),
  feedback: vi.fn(),
  sendChat: vi.fn(),
  regenerate: vi.fn(),
  editMessage: vi.fn(),
  voiceStatus: vi.fn(),
}));

const VOICE_OFF = {
  sttConfigured: false,
  ttsConfigured: false,
  message: "Voice is not configured.",
};

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
      update: vi.fn().mockResolvedValue({ conversation: { id: "c1" } }),
      abort: vi.fn().mockResolvedValue({ ok: true, aborted: true }),
      regenerate: mocks.regenerate,
      editMessage: mocks.editMessage,
    },
    chat: {
      send: mocks.sendChat,
    },
    models: {
      list: vi.fn().mockResolvedValue({
        models: [
          {
            id: "gemini-3.5-flash-lite",
            providerId: "gemini",
            name: "Gemini 3.5 Flash Lite",
            capabilities: ["text", "streaming"],
            enabled: true,
            available: true,
          },
          {
            id: "gemini-3.8-flash",
            providerId: "gemini",
            name: "Gemini 3.8 Flash",
            capabilities: ["text", "streaming"],
            enabled: true,
            available: true,
          },
          {
            id: "gemini-3.1-pro-preview",
            providerId: "gemini",
            name: "Gemini 3.1 Pro",
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
      status: mocks.voiceStatus,
      speak: vi.fn(),
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

beforeEach(() => {
  useModelStore.setState({ providerId: "", modelId: "" });
});

describe("ChatPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useModelStore.setState({ providerId: "", modelId: "" });
    vi.mocked(api.conversations.list).mockResolvedValue({ conversations: [] });
    mocks.listMessages.mockReset();
    mocks.feedback.mockReset();
    mocks.sendChat.mockReset();
    mocks.regenerate.mockReset();
    mocks.editMessage.mockReset();
    mocks.voiceStatus.mockReset();
    mocks.voiceStatus.mockResolvedValue(VOICE_OFF);
    mocks.listMessages.mockResolvedValue({ messages: [] });
    mocks.sendChat.mockImplementation(async function* () {
      /* idle */
    });
    mocks.regenerate.mockImplementation(async function* () {
      /* idle */
    });
    mocks.editMessage.mockImplementation(async function* () {
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
    expect(await screen.findByRole("button", { name: "Select model: Auto" })).toBeInTheDocument();
  });

  it("starts a new chat on Auto even if the last stored pick was 3.8", async () => {
    useModelStore.setState({ providerId: "gemini", modelId: "gemini-3.8-flash" });
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

    expect(await screen.findByRole("button", { name: "Select model: Auto" })).toBeInTheDocument();
  });

  it("keeps Gemini 3.8 Flash selected when opening a saved 3.8 thread", async () => {
    vi.mocked(api.conversations.list).mockResolvedValue({
      conversations: [
        {
          id: "c1",
          title: "Old thread",
          modelId: "gemini-3.8-flash",
          providerId: "gemini",
          archived: false,
          pinned: false,
          messageCount: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/chat/c1"]}>
          <Routes>
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("button", { name: "Select model: Gemini 3.8 Flash" })).toBeInTheDocument();
  });

  it("keeps Gemini 3.1 Pro selected when opening a saved Pro thread", async () => {
    vi.mocked(api.conversations.list).mockResolvedValue({
      conversations: [
        {
          id: "c1",
          title: "Pro thread",
          modelId: "gemini-3.1-pro-preview",
          providerId: "gemini",
          archived: false,
          pinned: false,
          messageCount: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/chat/c1"]}>
          <Routes>
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("button", { name: "Select model: Gemini 3.1 Pro" })).toBeInTheDocument();
  });

  it("sends the picker model and footers the model the server reports running", async () => {
    vi.mocked(api.conversations.list).mockResolvedValue({
      conversations: [
        {
          id: "c1",
          title: "Lite thread",
          modelId: "gemini-3.5-flash-lite",
          providerId: "gemini",
          archived: false,
          pinned: false,
          messageCount: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    mocks.sendChat.mockImplementation(async function* (_id, body) {
      yield {
        type: "start",
        conversation: { id: "c1", modelId: body.modelId },
        userMessage: {
          id: "u-new",
          conversationId: "c1",
          role: "user",
          content: body.content,
          status: "complete",
          createdAt: "2026-01-01T00:00:04.000Z",
          updatedAt: "2026-01-01T00:00:04.000Z",
        },
        assistantMessage: {
          id: "a-new",
          conversationId: "c1",
          role: "assistant",
          content: "",
          status: "streaming",
          model: body.modelId,
          createdAt: "2026-01-01T00:00:05.000Z",
          updatedAt: "2026-01-01T00:00:05.000Z",
        },
      };
      yield { type: "chunk", text: "There is" };
      yield {
        type: "complete",
        assistantMessage: {
          id: "a-new",
          conversationId: "c1",
          role: "assistant",
          content: "There is.",
          status: "complete",
          model: body.modelId,
          createdAt: "2026-01-01T00:00:05.000Z",
          updatedAt: "2026-01-01T00:00:05.000Z",
        },
      };
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/chat/c1"]}>
          <Routes>
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Select model: Gemini 3.5 Flash Lite" }));
    fireEvent.click(screen.getByRole("option", { name: /Gemini 3.1 Pro/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Select model: Gemini 3.1 Pro" })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(api.conversations.update).toHaveBeenCalledWith("c1", {
        providerId: "gemini",
        modelId: "gemini-3.1-pro-preview",
      });
    });

    const textarea = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(textarea, { target: { value: "Who are you?" } });
    fireEvent.submit(screen.getByRole("form", { name: "Send message" }));

    await waitFor(() => {
      expect(mocks.sendChat).toHaveBeenCalledWith(
        "c1",
        expect.objectContaining({
          content: "Who are you?",
          providerId: "gemini",
          modelId: "gemini-3.1-pro-preview",
        }),
        expect.anything(),
      );
    });
    expect(await screen.findByText("There is.")).toBeInTheDocument();
    const label = document.querySelector("[data-active-model='gemini-3.1-pro-preview']");
    expect(label).toHaveTextContent("Gemini 3.1 Pro");
    expect(document.querySelector("[data-active-model='gemini-3.5-flash-lite']")).toBeNull();
  });

  it("announces a quota fallback and footers the model that actually answered", async () => {
    useToastStore.setState({ toasts: [] });
    vi.mocked(api.conversations.list).mockResolvedValue({
      conversations: [
        {
          id: "c1",
          title: "Pro thread",
          modelId: "gemini-3.1-pro-preview",
          providerId: "gemini",
          archived: false,
          pinned: false,
          messageCount: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const liteReply = {
      id: "a-new",
      conversationId: "c1",
      role: "assistant",
      content: "",
      status: "streaming",
      model: "gemini-3.5-flash-lite",
      provider: "gemini",
      createdAt: "2026-01-01T00:00:05.000Z",
      updatedAt: "2026-01-01T00:00:05.000Z",
    };
    mocks.sendChat.mockImplementation(async function* (_id, body) {
      yield {
        type: "start",
        conversation: { id: "c1", modelId: body.modelId },
        userMessage: {
          id: "u-new",
          conversationId: "c1",
          role: "user",
          content: body.content,
          status: "complete",
          createdAt: "2026-01-01T00:00:04.000Z",
          updatedAt: "2026-01-01T00:00:04.000Z",
        },
        assistantMessage: liteReply,
      };
      // What the server sends when Pro's quota is exhausted.
      yield {
        type: "model",
        model: "gemini-3.5-flash-lite",
        provider: "gemini",
        activeModel: "gemini-3.5-flash-lite",
        fallbackFrom: "gemini-3.1-pro-preview",
        fallbackReason: "PROVIDER_RATE_LIMITED|429|quota_exceeded",
        assistantMessage: liteReply,
      };
      yield { type: "chunk", text: "Hello there." };
      yield {
        type: "complete",
        assistantMessage: { ...liteReply, content: "Hello there.", status: "complete" },
      };
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/chat/c1"]}>
          <Routes>
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("button", { name: "Select model: Gemini 3.1 Pro" })).toBeInTheDocument();
    const textarea = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.submit(screen.getByRole("form", { name: "Send message" }));

    await waitFor(() => {
      expect(mocks.sendChat).toHaveBeenCalledWith(
        "c1",
        expect.objectContaining({ providerId: "gemini", modelId: "gemini-3.1-pro-preview" }),
        expect.anything(),
      );
    });
    expect(await screen.findByText("Hello there.")).toBeInTheDocument();

    // The footer names the model that answered, never the one that was bypassed.
    expect(document.querySelector("[data-active-model='gemini-3.5-flash-lite']")).toHaveTextContent(
      "Gemini 3.5 Flash Lite",
    );
    expect(document.querySelector("[data-active-model='gemini-3.1-pro-preview']")).toBeNull();

    // The switch is announced exactly once, naming both models.
    const notices = useToastStore
      .getState()
      .toasts.filter((item) => item.message.includes("has reached its usage limit"));
    expect(notices.map((item) => item.message)).toEqual([
      "Gemini 3.1 Pro has reached its usage limit, so this reply is from Gemini 3.5 Flash Lite.",
    ]);

    // The user's choice stands, so the next message tries Pro again.
    expect(screen.getByRole("button", { name: "Select model: Gemini 3.1 Pro" })).toBeInTheDocument();
  });
  it("reserves message space while a thread is loading instead of flashing the empty state", async () => {
    mocks.listMessages.mockReturnValue(new Promise(() => undefined));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/chat/c1"]}>
          <Routes>
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByLabelText("Loading messages")).toBeInTheDocument();
    expect(screen.queryByText("Where should we begin?")).not.toBeInTheDocument();
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
    mocks.regenerate.mockReset();
    mocks.editMessage.mockReset();
    mocks.voiceStatus.mockReset();
    mocks.voiceStatus.mockResolvedValue(VOICE_OFF);
    mocks.listMessages.mockResolvedValue({ messages: [] });
    mocks.sendChat.mockImplementation(async function* () {
      /* idle */
    });
    mocks.regenerate.mockImplementation(async function* () {
      /* idle */
    });
    mocks.editMessage.mockImplementation(async function* () {
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

const thread = [
  {
    id: "u1",
    conversationId: "c1",
    role: "user" as const,
    content: "first question",
    status: "complete" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "a1",
    conversationId: "c1",
    role: "assistant" as const,
    content: "first answer",
    status: "complete" as const,
    createdAt: "2026-01-01T00:00:01.000Z",
    updatedAt: "2026-01-01T00:00:01.000Z",
  },
  {
    id: "u2",
    conversationId: "c1",
    role: "user" as const,
    content: "second question",
    status: "complete" as const,
    createdAt: "2026-01-01T00:00:02.000Z",
    updatedAt: "2026-01-01T00:00:02.000Z",
  },
  {
    id: "a2",
    conversationId: "c1",
    role: "assistant" as const,
    content: "second answer",
    status: "complete" as const,
    createdAt: "2026-01-01T00:00:03.000Z",
    updatedAt: "2026-01-01T00:00:03.000Z",
  },
];

function resetChatMocks(): void {
  window.localStorage.clear();
  mocks.listMessages.mockReset();
  mocks.feedback.mockReset();
  mocks.sendChat.mockReset();
  mocks.regenerate.mockReset();
  mocks.editMessage.mockReset();
  mocks.voiceStatus.mockReset();
  mocks.voiceStatus.mockResolvedValue(VOICE_OFF);
  mocks.sendChat.mockImplementation(async function* () {
    /* idle */
  });
  mocks.regenerate.mockImplementation(async function* () {
    /* idle */
  });
  mocks.editMessage.mockImplementation(async function* () {
    /* idle */
  });
  mocks.listMessages.mockResolvedValue({ messages: thread });
}

describe("ChatPage message actions", () => {
  beforeEach(resetChatMocks);

  it("renders the full action toolbar on every assistant turn loaded from history", async () => {
    renderConversation();

    await screen.findByText("first answer");

    // Two assistant turns in history means two of each control, including the
    // one that is no longer the newest message in the thread.
    expect(screen.getAllByRole("button", { name: "Copy" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Regenerate" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Good response" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Bad response" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Play audio" })).toHaveLength(2);
  });

  it("offers Speak on every assistant turn when text-to-speech is configured", async () => {
    mocks.voiceStatus.mockResolvedValue({ sttConfigured: false, ttsConfigured: true });

    renderConversation();

    await waitFor(() => {
      const speak = screen.getAllByRole("button", { name: "Play audio" });
      expect(speak).toHaveLength(2);
      expect(speak[0]).toBeEnabled();
    });
  });

  it("disables Speak with a reason when nothing can produce audio", async () => {
    mocks.voiceStatus.mockResolvedValue({
      sttConfigured: false,
      ttsConfigured: false,
      message: "Voice is not configured.",
    });

    renderConversation();

    const speak = await screen.findAllByRole("button", { name: "Play audio" });
    expect(speak[0]).toBeDisabled();
    expect(speak[0]).toHaveAttribute("title", "Voice is not configured.");
  });

  it("keeps the per-message feedback state separate on an older assistant turn", async () => {
    mocks.listMessages.mockResolvedValue({
      messages: [thread[0], { ...thread[1], feedback: { rating: "up" } }, thread[2], thread[3]],
    });

    renderConversation();

    const good = await screen.findAllByRole("button", { name: "Good response" });
    expect(good[0]).toHaveAttribute("aria-pressed", "true");
    expect(good[1]).toHaveAttribute("aria-pressed", "false");
  });

  it("regenerating an older assistant turn drops it and everything after it", async () => {
    mocks.regenerate.mockImplementation(async function* () {
      yield {
        type: "start",
        conversation: { id: "c1" },
        userMessage: thread[0],
        assistantMessage: {
          ...thread[1],
          id: "a3",
          content: "",
          status: "streaming",
          createdAt: "2026-01-01T00:00:09.000Z",
        },
        generationId: "g1",
      };
      yield { type: "chunk", text: "rewritten answer" };
      yield {
        type: "complete",
        assistantMessage: {
          ...thread[1],
          id: "a3",
          content: "rewritten answer",
          status: "complete",
          createdAt: "2026-01-01T00:00:09.000Z",
        },
      };
    });

    renderConversation();
    const regenerate = await screen.findAllByRole("button", { name: "Regenerate" });
    fireEvent.click(regenerate[0] as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText("rewritten answer")).toBeInTheDocument();
    });
    // The superseded branch must not survive alongside the new answer.
    expect(screen.queryByText("first answer")).not.toBeInTheDocument();
    expect(screen.queryByText("second question")).not.toBeInTheDocument();
    expect(screen.queryByText("second answer")).not.toBeInTheDocument();
    expect(mocks.regenerate).toHaveBeenCalledWith(
      "c1",
      "a1",
      expect.anything(),
      { providerId: "auto", modelId: "auto" },
    );
  });
});

describe("ChatPage message editing", () => {
  beforeEach(() => {
    resetChatMocks();
    // The server appends the reworded question as a new turn, so "start"
    // carries ids that were not in the thread before.
    mocks.editMessage.mockImplementation(async function* () {
      yield {
        type: "start",
        conversation: { id: "c1" },
        userMessage: {
          ...thread[0],
          id: "u9",
          content: "edited question",
          createdAt: "2026-01-01T00:00:08.000Z",
        },
        assistantMessage: {
          ...thread[1],
          id: "a9",
          content: "",
          status: "streaming",
          createdAt: "2026-01-01T00:00:09.000Z",
        },
        generationId: "g1",
      };
      yield { type: "chunk", text: "answer to the edit" };
      yield {
        type: "complete",
        assistantMessage: {
          ...thread[1],
          id: "a9",
          content: "answer to the edit",
          status: "complete",
          createdAt: "2026-01-01T00:00:09.000Z",
        },
      };
    });
  });

  async function editFirstQuestion(): Promise<void> {
    await screen.findByText("first question");
    fireEvent.click(screen.getAllByRole("button", { name: "Edit message" })[0] as HTMLElement);
    const editor = await screen.findByRole("textbox", { name: "Edit your message" });
    fireEvent.change(editor, { target: { value: "edited question" } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
  }

  it("asks the reworded question and answers it", async () => {
    renderConversation();
    await editFirstQuestion();

    await waitFor(() => {
      expect(screen.getByText("answer to the edit")).toBeInTheDocument();
    });
    expect(screen.getByText("edited question")).toBeInTheDocument();
    expect(mocks.editMessage).toHaveBeenCalledWith(
      "c1",
      "u1",
      "edited question",
      expect.anything(),
      { providerId: "auto", modelId: "auto" },
    );
  });

  it("keeps every earlier turn on screen", async () => {
    renderConversation();
    await editFirstQuestion();

    await waitFor(() => {
      expect(screen.getByText("answer to the edit")).toBeInTheDocument();
    });
    expect(screen.getByText("first question")).toBeInTheDocument();
    expect(screen.getByText("first answer")).toBeInTheDocument();
    expect(screen.getByText("second question")).toBeInTheDocument();
    expect(screen.getByText("second answer")).toBeInTheDocument();
  });

  it("appends one new exchange rather than duplicating turns", async () => {
    renderConversation();
    await editFirstQuestion();

    await waitFor(() => {
      expect(screen.getByText("answer to the edit")).toBeInTheDocument();
    });
    expect(screen.getAllByText("edited question")).toHaveLength(1);
    // Three assistant turns and three user turns: the original four plus the
    // appended pair.
    expect(screen.getAllByRole("button", { name: "Copy" })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "Copy message" })).toHaveLength(3);
  });

  it("never starts the new answer pre-filled with a previous reply", async () => {
    // Deliberately stops after "start": the fresh bubble must be empty rather
    // than inheriting the text of an existing reply.
    mocks.editMessage.mockImplementation(async function* () {
      yield {
        type: "start",
        conversation: { id: "c1" },
        userMessage: {
          ...thread[2],
          id: "u9",
          content: "edited question",
          createdAt: "2026-01-01T00:00:08.000Z",
        },
        assistantMessage: {
          ...thread[1],
          id: "a9",
          content: "",
          status: "streaming",
          createdAt: "2026-01-01T00:00:09.000Z",
        },
        generationId: "g1",
      };
    });

    renderConversation();
    await screen.findByText("second question");
    fireEvent.click(screen.getAllByRole("button", { name: "Edit message" })[1] as HTMLElement);
    const editor = await screen.findByRole("textbox", { name: "Edit your message" });
    fireEvent.change(editor, { target: { value: "edited question" } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => {
      expect(screen.getByRole("status", { name: "Generating response" })).toBeInTheDocument();
    });
    // Nothing was discarded, and no existing answer leaked into the new bubble.
    expect(screen.getAllByText("first answer")).toHaveLength(1);
    expect(screen.getAllByText("second answer")).toHaveLength(1);
  });
});

describe("ChatPage live voice", () => {
  beforeEach(resetChatMocks);

  it("disables the live voice button when the browser cannot listen", async () => {
    renderConversation();

    const live = await screen.findByRole("button", { name: "Live voice chat" });
    expect(live).toBeDisabled();
    expect(live).toHaveAttribute(
      "title",
      "Live voice needs speech recognition, which this browser does not provide.",
    );
  });

  it("opens the hands-free session when recognition is available", async () => {
    class FakeRecognition {
      lang = "";
      interimResults = false;
      continuous = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start() {}
      stop() {}
    }
    vi.stubGlobal("SpeechRecognition", FakeRecognition);

    try {
      renderConversation();
      fireEvent.click(await screen.findByRole("button", { name: "Live voice chat" }));

      const dialog = await screen.findByRole("dialog", { name: "Live voice chat" });
      expect(dialog).toHaveTextContent("Listening");

      fireEvent.click(screen.getByRole("button", { name: /End live chat/ }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Live voice chat" })).not.toBeInTheDocument();
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
