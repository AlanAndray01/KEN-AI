import type {
  ExportFormat,
  PublicCredentialTest,
  PublicCustomInstruction,
  PublicMemory,
  PublicUsageSummary,
  PublicUser,
  PublicUserCredential,
} from "@Ken/shared";
import { downloadRequest, request } from "./client";
import type { OkResponse } from "./types";

export const meApi = {
  update: (body: {
    name?: string;
    preferences?: {
      theme?: "light" | "dark" | "system";
      language?: string;
      sendOnEnter?: boolean;
      selectedProviderId?: string;
      selectedModelId?: string;
      selectionMode?: "auto" | "manual";
    };
  }) => request<{ user: PublicUser }>("/me", { method: "PATCH", body: JSON.stringify(body) }),
  usage: () => request<{ usage: PublicUsageSummary }>("/me/usage"),
  exportChats: (format: ExportFormat) => downloadRequest(`/me/export?format=${format}`, `Ken-chats.${format}`),
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
};

export const settingsApi = {
  saveKey: (body: { providerId: string; apiKey: string; modelId?: string; label?: string }) =>
    request<{ credential: PublicUserCredential }>("/settings/keys", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export const instructionsApi = {
  get: () => request<{ instructions: PublicCustomInstruction }>("/me/instructions"),
  upsert: (body: { aboutUser: string; howToRespond: string; additional: string }) =>
    request<{ instructions: PublicCustomInstruction }>("/me/instructions", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};

export const memoriesApi = {
  list: () => request<{ memories: PublicMemory[] }>("/memories"),
  create: (body: { content: string; conversationId?: string }) =>
    request<{ memory: PublicMemory }>("/memories", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: { content: string }) =>
    request<{ memory: PublicMemory }>(`/memories/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id: string) => request<{ ok: true }>(`/memories/${id}`, { method: "DELETE" }),
};
