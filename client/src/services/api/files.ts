import type { PublicFile } from "@Ken/shared";
import { authedFetch, failIfNotOk, request } from "./client";

export const filesApi = {
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
};
