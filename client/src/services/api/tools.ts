import type { PublicFile, PublicSearchHit, PublicTool } from "@Ken/shared";
import { request } from "./client";

export const toolsApi = {
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
};
