import type { ChatToolId, ExportFormat, PublicConversation, PublicMessage, PublicShare } from "@Ken/shared";
import { downloadRequest, request, streamRequest } from "./client";

export const conversationsApi = {
  list: (archived = false) =>
    request<{ conversations: PublicConversation[] }>(`/conversations${archived ? "?archived=true" : ""}`),
  create: (body: { modelId: string; providerId: string; title?: string; customGptId?: string }) =>
    request<{ conversation: PublicConversation }>("/conversations", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  get: (id: string) => request<{ conversation: PublicConversation }>(`/conversations/${id}`),
  update: (
    id: string,
    body: { title?: string; archived?: boolean; pinned?: boolean; modelId?: string; providerId?: string },
  ) =>
    request<{ conversation: PublicConversation }>(`/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  remove: (id: string) => request<{ ok: true }>(`/conversations/${id}`, { method: "DELETE" }),
  messages: (id: string, options: { limit?: number; before?: string } = {}) => {
    const query = new URLSearchParams();
    if (options.limit) query.set("limit", String(options.limit));
    if (options.before) query.set("before", options.before);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return request<{ messages: PublicMessage[]; hasMore: boolean }>(`/conversations/${id}/messages${suffix}`);
  },
  send: (
    id: string,
    body: {
      content: string;
      modelId?: string;
      providerId?: string;
      attachmentIds?: string[];
      enabledTools?: ChatToolId[];
      customGptId?: string;
    },
    signal?: AbortSignal,
  ) => streamRequest(`/conversations/${id}/messages`, body, signal),
  regenerate: (id: string, messageId: string, signal?: AbortSignal, body?: { modelId?: string; providerId?: string }) =>
    streamRequest(`/conversations/${id}/messages/${messageId}/regenerate`, body ?? {}, signal),
  /** Rewrites a user turn and streams a fresh answer; later turns are dropped. */
  editMessage: (
    id: string,
    messageId: string,
    content: string,
    signal?: AbortSignal,
    body?: { modelId?: string; providerId?: string },
  ) =>
    streamRequest(`/conversations/${id}/messages/${messageId}/edit`, { content, ...body }, signal),
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
    create: (id: string) => request<{ share: PublicShare }>(`/conversations/${id}/share`, { method: "POST" }),
    revoke: (id: string) => request<{ ok: true }>(`/conversations/${id}/share`, { method: "DELETE" }),
  },
  export: (id: string, format: ExportFormat) =>
    downloadRequest(`/conversations/${id}/export?format=${format}`, `conversation.${format}`),
};

export const chatApi = {
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
};
