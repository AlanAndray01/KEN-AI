import type { GptCategory, GptVisibility, ModelCapability, PublicCustomGpt } from "@Ken/shared";
import { request } from "./client";

export const gptsApi = {
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
};
