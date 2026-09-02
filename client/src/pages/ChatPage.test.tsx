import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
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

describe("ChatPage", () => {
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
    expect(mocks.regenerate).toHaveBeenCalledWith("c1", "a1", expect.anything());
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
    expect(mocks.editMessage).toHaveBeenCalledWith("c1", "u1", "edited question", expect.anything());
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
