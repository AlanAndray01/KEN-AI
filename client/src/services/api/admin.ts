import type { PublicAIModel, PublicAIProvider, PublicUsageSummary } from "@Ken/shared";
import { request } from "./client";

export const adminApi = {
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
};
