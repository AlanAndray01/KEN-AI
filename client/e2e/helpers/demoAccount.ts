/**
 * Dedicated QA demo identity used only by Playwright.
 *
 * Tests never type a password or hit Mongo. `installMockSession` intercepts
 * `/api/auth/me` and returns this user so ProtectedRoute opens `/chat`.
 */
export const DEMO_ACCOUNT = {
  id: "user-qa-demo",
  name: "Ken QA Demo",
  email: "qa.demo@ken.test",
  role: "user" as const,
};

export const DEMO_CONVERSATION_ID = "conv-qa-demo";

const now = "2026-09-02T10:00:00.000Z";

export const DEMO_USER = {
  id: DEMO_ACCOUNT.id,
  name: DEMO_ACCOUNT.name,
  email: DEMO_ACCOUNT.email,
  role: DEMO_ACCOUNT.role,
  preferences: {
    theme: "dark" as const,
    language: "en",
    sendOnEnter: true,
    selectedProviderId: "groq",
    selectedModelId: "openai/gpt-oss-20b",
  },
  createdAt: now,
  updatedAt: now,
};

export const DEMO_MODEL = {
  id: "openai/gpt-oss-20b",
  providerId: "groq",
  name: "GPT OSS 20B",
  capabilities: ["text", "streaming", "vision", "tools"],
  enabled: true,
  available: true,
};

export const DEMO_CONVERSATION = {
  id: DEMO_CONVERSATION_ID,
  title: "QA demo thread",
  modelId: DEMO_MODEL.id,
  providerId: DEMO_MODEL.providerId,
  archived: false,
  pinned: false,
  lastMessageAt: now,
  lastMessagePreview: "Hello Ken",
  messageCount: 2,
  createdAt: now,
  updatedAt: now,
};

export const DEMO_MESSAGES = [
  {
    id: "msg-user-1",
    conversationId: DEMO_CONVERSATION_ID,
    role: "user" as const,
    content: "Hello Ken — this is a short QA prompt.",
    status: "complete" as const,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "msg-assistant-1",
    conversationId: DEMO_CONVERSATION_ID,
    role: "assistant" as const,
    content: "Hello. This is a mocked reply used only by the viewport suite.",
    status: "complete" as const,
    model: DEMO_MODEL.id,
    provider: DEMO_MODEL.providerId,
    createdAt: now,
    updatedAt: now,
  },
];
