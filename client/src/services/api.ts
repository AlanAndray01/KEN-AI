import type {
  ChatToolId,
  ExportFormat,
  GptCategory,
  GptVisibility,
  HealthResponse,
  ModelCapability,
  PublicAIModel,
  PublicAIProvider,
  PublicAnalysisJob,
  PublicConversation,
  PublicCustomGpt,
  PublicCustomInstruction,
  PublicFile,
  PublicMemory,
  PublicMessage,
  PublicNotification,
  PublicSearchHit,
  PublicShare,
  PublicSharedConversation,
  PublicTool,
  PublicUsageSummary,
  PublicUser,
  PublicUserCredential,
  PublicCredentialTest,
  PublicVoiceStatus,
} from "@Ken/shared";
import { resolveApiBaseUrl } from "@/utils/apiBaseUrl";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly emailSent?: boolean;
  readonly requiresVerification?: boolean;
  readonly email?: string;

  constructor(
    message: string,
    options: {
      status: number;
      code: string;
      requestId?: string;
      emailSent?: boolean;
      requiresVerification?: boolean;
      email?: string;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    if (options.requestId !== undefined) {
      this.requestId = options.requestId;
    }
    if (options.emailSent !== undefined) {
      this.emailSent = options.emailSent;
    }
    if (options.requiresVerification !== undefined) {
      this.requiresVerification = options.requiresVerification;
    }
    if (options.email !== undefined) {
      this.email = options.email;
    }
  }
}

export interface AuthResponse {
  user: PublicUser;
}

export interface VerificationRequiredResponse {
  success?: true;
  message?: string;
  requiresVerification: true;
  email: string;
  emailSent: boolean;
  verificationCode?: string;
}

export interface OkResponse {
  ok: true;
  resetToken?: string;
}

export interface ChatStreamEvent {
  type: "start" | "chunk" | "complete" | "aborted" | "error" | "timing" | "model";
  conversation?: PublicConversation;
  userMessage?: PublicMessage;
  assistantMessage?: PublicMessage;
  generationId?: string;
  text?: string;
  message?: string;
  code?: string;
  requestId?: string;
  requestedModel?: string;
  activeModel?: string;
  fallbackFrom?: string;
  fallbackReason?: string;
  ttfbMs?: number;
  googleConnectMs?: number;
  firstVisibleChunkMs?: number;
  completeMs?: number;
  model?: string;
  provider?: string;
}

async function* streamRequest(path: string, body: unknown, signal?: AbortSignal): AsyncGenerator<ChatStreamEvent> {
  const idle = createIdleWatchdog(180_000, signal);
  const init: RequestInit = {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
  init.signal = idle.signal;
  const response = await authedFetch(path, init);

  const requestId = response.headers.get("x-request-id") ?? undefined;
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    let code = "REQUEST_FAILED";
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: { code?: string; message?: string } };
      code = payload.error?.code ?? code;
      message = payload.error?.message ?? message;
    } catch {
      // Non-JSON error bodies are treated as generic failures.
    }
    throw new ApiError(message, { status: response.status, code, ...(requestId ? { requestId } : {}) });
  }

  if (!contentType.includes("text/event-stream") || !response.body) {
    throw new ApiError("Streaming is unavailable", { status: 502, code: "STREAM_UNAVAILABLE" });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      idle.ping();
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const event = parseSseBlock(part);
        if (event) yield event;
      }
    }
    const tail = parseSseBlock(buffer);
    if (tail) yield tail;
  } finally {
    idle.stop();
    reader.releaseLock();
  }
}

function parseSseBlock(block: string): ChatStreamEvent | undefined {
  const eventLine = block.split("\n").find((line) => line.startsWith("event:"));
  const dataLines = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  const raw = dataLines.join("\n").trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as ChatStreamEvent;
    if (eventLine) {
      parsed.type = eventLine.slice(6).trim() as ChatStreamEvent["type"];
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function createIdleWatchdog(
  idleMs: number,
  parent?: AbortSignal,
): { signal: AbortSignal; ping: () => void; stop: () => void } {
  const controller = new AbortController();
  let timer: number | undefined;

  const arm = (): void => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      controller.abort();
    }, idleMs);
  };

  const onParentAbort = (): void => controller.abort();
  parent?.addEventListener("abort", onParentAbort, { once: true });
  arm();

  const signals = parent ? [parent, controller.signal] : [controller.signal];
  return {
    signal: typeof AbortSignal.any === "function" ? AbortSignal.any(signals) : controller.signal,
    ping: arm,
    stop: () => {
      if (timer) window.clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    },
  };
}

const API_BASE_URL = resolveApiBaseUrl(import.meta.env);

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

/**
 * Endpoints that establish or clear a session. A 401 from these is a real
 * credential failure, so retrying them after a refresh would loop forever.
 */
const SESSION_ENDPOINTS = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
  "/auth/verify-email",
  "/auth/resend-code",
]);

let refreshInFlight: Promise<boolean> | null = null;
const unauthorizedListeners = new Set<() => void>();

/** Notified when the session cannot be recovered and the user must sign in again. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

async function performRefresh(): Promise<boolean> {
  try {
    const response = await fetch(apiUrl("/auth/refresh"), {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Concurrent 401s share one refresh so the refresh token rotates only once. */
function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * The access cookie is short lived while the refresh cookie outlives it. On a
 * 401 we rotate the session once and replay the request, so an expired access
 * token never surfaces to the user as a failed action.
 */
async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const requestInit: RequestInit = { ...init, credentials: "include" };
  const response = await fetch(apiUrl(path), requestInit);

  if (response.status !== 401 || SESSION_ENDPOINTS.has(path)) {
    return response;
  }

  if (!(await refreshSession())) {
    for (const listener of unauthorizedListeners) listener();
    return response;
  }

  return fetch(apiUrl(path), requestInit);
}

function apiErrorFromBody(
  status: number,
  requestId: string | undefined,
  body: {
    error?: { code?: string; message?: string };
    emailSent?: boolean;
    requiresVerification?: boolean;
    email?: string;
  },
  fallbackCode: string,
  fallbackMessage: string,
): ApiError {
  return new ApiError(body.error?.message ?? fallbackMessage, {
    status,
    code: body.error?.code ?? fallbackCode,
    ...(requestId ? { requestId } : {}),
    ...(typeof body.emailSent === "boolean" ? { emailSent: body.emailSent } : {}),
    ...(body.requiresVerification === true ? { requiresVerification: true } : {}),
    ...(typeof body.email === "string" ? { email: body.email } : {}),
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authedFetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const requestId = response.headers.get("x-request-id") ?? undefined;

  if (!response.ok) {
    let body: {
      error?: { code?: string; message?: string };
      emailSent?: boolean;
      requiresVerification?: boolean;
      email?: string;
    } = {};
    try {
      body = (await response.json()) as typeof body;
    } catch {
      // Non-JSON error bodies are treated as generic failures.
    }
    throw apiErrorFromBody(
      response.status,
      requestId,
      body,
      "REQUEST_FAILED",
      `Request failed (${response.status})`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function failIfNotOk(response: Response): Promise<void> {
  if (response.ok) return;
  const requestId = response.headers.get("x-request-id") ?? undefined;
  let code = "REQUEST_FAILED";
  let message = `Request failed (${response.status})`;
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    // Non-JSON error bodies are treated as generic failures.
  }
  throw new ApiError(message, {
    status: response.status,
    code,
    ...(requestId ? { requestId } : {}),
  });
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return star[1];
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];
  const plain = /filename=([^;]+)/i.exec(header);
  return plain?.[1]?.trim() ?? fallback;
}

async function downloadRequest(path: string, fallback: string): Promise<{ blob: Blob; filename: string }> {
  const response = await authedFetch(path);
  await failIfNotOk(response);
  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get("Content-Disposition"), fallback),
  };
}

export const api = {
  health: {
    get: () => request<HealthResponse>("/health"),
  },
  auth: {
    register: (body: { name: string; email: string; password: string }) =>
      request<VerificationRequiredResponse>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
    login: (body: { email: string; password: string }) =>
      request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
    verifyEmail: (body: { email: string; code: string }) =>
      request<AuthResponse>("/auth/verify-email", { method: "POST", body: JSON.stringify(body) }),
    resendCode: (body: { email: string }) =>
      request<OkResponse>("/auth/resend-code", { method: "POST", body: JSON.stringify(body) }),
    logout: () => request<OkResponse>("/auth/logout", { method: "POST" }),
    refresh: () => request<AuthResponse>("/auth/refresh", { method: "POST" }),
    me: () => request<AuthResponse>("/auth/me"),
    forgotPassword: (body: { email: string }) =>
      request<OkResponse>("/auth/forgot-password", { method: "POST", body: JSON.stringify(body) }),
    resetPassword: (body: { email: string; password: string; token?: string; code?: string }) =>
      request<OkResponse>("/auth/reset-password", { method: "POST", body: JSON.stringify(body) }),
    changePassword: (body: { currentPassword: string; newPassword: string }) =>
      request<OkResponse>("/auth/change-password", { method: "POST", body: JSON.stringify(body) }),
    googleStartUrl: `${API_BASE_URL}/auth/google`,
  },
  models: {
    list: () => request<{ models: PublicAIModel[] }>("/models"),
  },
  providers: {
    list: () => request<{ providers: PublicAIProvider[] }>("/providers"),
  },
  me: {
    update: (body: {
      name?: string;
      preferences?: {
        theme?: "light" | "dark" | "system";
        language?: string;
        sendOnEnter?: boolean;
        selectedProviderId?: string;
        selectedModelId?: string;
      };
    }) => request<{ user: PublicUser }>("/me", { method: "PATCH", body: JSON.stringify(body) }),
    usage: () => request<{ usage: PublicUsageSummary }>("/me/usage"),
    exportChats: (format: ExportFormat) =>
      downloadRequest(`/me/export?format=${format}`, `Ken-chats.${format}`),
    /** Irreversible. The server clears auth cookies as part of the response. */
    deleteAccount: (body: { confirmEmail: string; password?: string }) =>
      request<OkResponse>("/me", { method: "DELETE", body: JSON.stringify(body) }),
    credentials: {
      list: () => request<{ credentials: PublicUserCredential[] }>("/me/provider-credentials"),
      upsert: (providerId: string, body: { apiKey: string; baseUrl?: string; enabled?: boolean }) =>
        request<{ credential: PublicUserCredential }>(`/me/provider-credentials/${providerId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        }),
      test: (providerId: string, body?: { apiKey?: string; baseUrl?: string }) =>
        request<PublicCredentialTest>(`/me/provider-credentials/${providerId}/test`, {
          method: "POST",
          body: JSON.stringify(body ?? {}),
        }),
      remove: (providerId: string) =>
        request<{ ok: true }>(`/me/provider-credentials/${providerId}`, { method: "DELETE" }),
    },
  },
  settings: {
    saveKey: (body: { providerId: string; apiKey: string; modelId?: string; label?: string }) =>
      request<{ credential: PublicUserCredential }>("/settings/keys", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  admin: {
    providers: {
      list: () => request<{ providers: PublicAIProvider[] }>("/admin/providers"),
      create: (body: {
        name: string;
        type: PublicAIProvider["type"];
        apiKey?: string;
        baseUrl?: string;
        enabled?: boolean;
        providerId?: string;
      }) => request<{ provider: PublicAIProvider }>("/admin/providers", { method: "POST", body: JSON.stringify(body) }),
      update: (id: string, body: { name?: string; apiKey?: string; baseUrl?: string; enabled?: boolean }) =>
        request<{ provider: PublicAIProvider }>(`/admin/providers/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      test: (id: string, body?: { apiKey?: string; baseUrl?: string }) =>
        request<{ provider: PublicAIProvider }>(`/admin/providers/${id}/test`, {
          method: "POST",
          body: JSON.stringify(body ?? {}),
        }),
      enable: (id: string, enabled: boolean) =>
        request<{ provider: PublicAIProvider }>(`/admin/providers/${id}/enable`, {
          method: "POST",
          body: JSON.stringify({ enabled }),
        }),
      remove: (id: string) => request<{ ok: true }>(`/admin/providers/${id}`, { method: "DELETE" }),
    },
    models: {
      list: () => request<{ models: PublicAIModel[] }>("/admin/models"),
      update: (providerId: string, modelId: string, body: { enabled?: boolean; name?: string }) =>
        request<{ model: PublicAIModel }>(`/admin/models/${providerId}/${modelId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
    },
    usage: () => request<{ usage: PublicUsageSummary }>("/admin/usage"),
  },
  conversations: {
    list: (archived = false) =>
      request<{ conversations: PublicConversation[] }>(`/conversations${archived ? "?archived=true" : ""}`),
    create: (body: { modelId: string; providerId: string; title?: string; customGptId?: string }) =>
      request<{ conversation: PublicConversation }>("/conversations", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    get: (id: string) => request<{ conversation: PublicConversation }>(`/conversations/${id}`),
    update: (id: string, body: { title?: string; archived?: boolean; pinned?: boolean }) =>
      request<{ conversation: PublicConversation }>(`/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (id: string) => request<{ ok: true }>(`/conversations/${id}`, { method: "DELETE" }),
    messages: (id: string) => request<{ messages: PublicMessage[] }>(`/conversations/${id}/messages`),
    send: (id: string, body: { content: string; modelId?: string; providerId?: string; attachmentIds?: string[]; enabledTools?: ChatToolId[]; customGptId?: string }, signal?: AbortSignal) =>
      streamRequest(`/conversations/${id}/messages`, body, signal),
    regenerate: (id: string, messageId: string, signal?: AbortSignal) =>
      streamRequest(`/conversations/${id}/messages/${messageId}/regenerate`, {}, signal),
    /** Rewrites a user turn and streams a fresh answer; later turns are dropped. */
    editMessage: (id: string, messageId: string, content: string, signal?: AbortSignal) =>
      streamRequest(`/conversations/${id}/messages/${messageId}/edit`, { content }, signal),
    feedback: (id: string, messageId: string, body: { rating: "up" | "down"; comment?: string }) =>
      request<{ message: PublicMessage }>(`/conversations/${id}/messages/${messageId}/feedback`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    abort: (id: string, generationId?: string) =>
      request<{ ok: true; aborted: boolean }>(`/conversations/${id}/generation/abort`, {
        method: "POST",
        body: JSON.stringify(generationId ? { generationId } : {}),
      }),
    share: {
      get: (id: string) => request<{ share: PublicShare | null }>(`/conversations/${id}/share`),
      create: (id: string) =>
        request<{ share: PublicShare }>(`/conversations/${id}/share`, { method: "POST" }),
      revoke: (id: string) => request<{ ok: true }>(`/conversations/${id}/share`, { method: "DELETE" }),
    },
    export: (id: string, format: ExportFormat) =>
      downloadRequest(`/conversations/${id}/export?format=${format}`, `conversation.${format}`),
  },
  chat: {
    send: (
      body: {
        content: string;
        conversationId?: string;
        modelId?: string;
        providerId?: string;
        attachmentIds?: string[];
        enabledTools?: ChatToolId[];
        customGptId?: string;
      },
      signal?: AbortSignal,
    ) => streamRequest("/chat", body, signal),
  },
  files: {
    list: () => request<{ files: PublicFile[] }>("/files"),
    upload: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      const response = await authedFetch("/files", {
        method: "POST",
        body,
      });
      await failIfNotOk(response);
      return (await response.json()) as { file: PublicFile };
    },
    get: (id: string) => request<{ file: PublicFile }>(`/files/${id}`),
    content: async (id: string) => {
      const response = await authedFetch(`/files/${id}/content`);
      await failIfNotOk(response);
      return response.blob();
    },
    remove: (id: string) => request<{ ok: true }>(`/files/${id}`, { method: "DELETE" }),
  },
  tools: {
    list: (providerId?: string, modelId?: string) => {
      const query = new URLSearchParams();
      if (providerId) query.set("providerId", providerId);
      if (modelId) query.set("modelId", modelId);
      const suffix = query.size > 0 ? `?${query.toString()}` : "";
      return request<{ tools: PublicTool[] }>(`/tools${suffix}`);
    },
    search: (body: { query: string }) =>
      request<{ hits: PublicSearchHit[] }>("/tools/search", { method: "POST", body: JSON.stringify(body) }),
    generateImage: (body: { prompt: string }) =>
      request<{ file: PublicFile }>("/tools/images", { method: "POST", body: JSON.stringify(body) }),
  },
  voice: {
    status: () => request<PublicVoiceStatus>("/voice/status"),
    transcribe: async (file: Blob) => {
      const body = new FormData();
      body.append("audio", file, "recording.webm");
      const response = await authedFetch("/voice/transcribe", {
        method: "POST",
        body,
      });
      await failIfNotOk(response);
      return (await response.json()) as { text: string };
    },
    speak: async (text: string) => {
      const response = await authedFetch("/voice/speak", {
        method: "POST",
        headers: { Accept: "audio/mpeg", "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      await failIfNotOk(response);
      return response.blob();
    },
  },
  analysis: {
    createJob: (body: { code: string; language?: "python"; fileIds?: string[] }) =>
      request<{ job: PublicAnalysisJob }>("/analysis/jobs", { method: "POST", body: JSON.stringify(body) }),
    getJob: (id: string) => request<{ job: PublicAnalysisJob }>(`/analysis/jobs/${id}`),
  },
  memories: {
    list: () => request<{ memories: PublicMemory[] }>("/memories"),
    create: (body: { content: string; conversationId?: string }) =>
      request<{ memory: PublicMemory }>("/memories", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { content: string }) =>
      request<{ memory: PublicMemory }>(`/memories/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) => request<{ ok: true }>(`/memories/${id}`, { method: "DELETE" }),
  },
  instructions: {
    get: () => request<{ instructions: PublicCustomInstruction }>("/me/instructions"),
    upsert: (body: { aboutUser: string; howToRespond: string; additional: string }) =>
      request<{ instructions: PublicCustomInstruction }>("/me/instructions", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
  },
  gpts: {
    list: (options: { scope?: "mine" | "explore" | "usable"; q?: string; category?: GptCategory } = {}) => {
      const query = new URLSearchParams();
      if (options.scope) query.set("scope", options.scope);
      if (options.q) query.set("q", options.q);
      if (options.category) query.set("category", options.category);
      const suffix = query.size > 0 ? `?${query.toString()}` : "";
      return request<{ gpts: PublicCustomGpt[] }>(`/gpts${suffix}`);
    },
    get: (id: string) => request<{ gpt: PublicCustomGpt }>(`/gpts/${id}`),
    create: (body: {
      name: string;
      description?: string;
      instructions?: string;
      conversationStarters?: string[];
      knowledgeFileIds?: string[];
      capabilities?: ModelCapability[];
      modelId?: string;
      providerId?: string;
      visibility?: GptVisibility;
      category?: GptCategory;
    }) => request<{ gpt: PublicCustomGpt }>("/gpts", { method: "POST", body: JSON.stringify(body) }),
    update: (
      id: string,
      body: {
        name?: string;
        description?: string;
        instructions?: string;
        conversationStarters?: string[];
        knowledgeFileIds?: string[];
        capabilities?: ModelCapability[];
        modelId?: string;
        providerId?: string;
        visibility?: GptVisibility;
        category?: GptCategory;
      },
    ) => request<{ gpt: PublicCustomGpt }>(`/gpts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) => request<{ ok: true }>(`/gpts/${id}`, { method: "DELETE" }),
  },
  share: {
    get: (token: string) =>
      request<{ conversation: PublicSharedConversation; readOnly: true }>(`/share/${token}`),
  },
  notifications: {
    list: () => request<{ notifications: PublicNotification[] }>("/notifications"),
    markRead: (id: string) =>
      request<{ notification: PublicNotification }>(`/notifications/${id}/read`, { method: "POST" }),
    markAllRead: () => request<{ ok: true; updated: number }>("/notifications/read-all", { method: "POST" }),
  },
};
