import type {
  HealthResponse,
  PublicAnalysisJob,
  PublicNotification,
  PublicSharedConversation,
} from "@Ken/shared";
import { request } from "./client";

export const healthApi = {
  get: () => request<HealthResponse>("/health"),
};

export const analysisApi = {
  createJob: (body: { code: string; language?: "python"; fileIds?: string[] }) =>
    request<{ job: PublicAnalysisJob }>("/analysis/jobs", { method: "POST", body: JSON.stringify(body) }),
  getJob: (id: string) => request<{ job: PublicAnalysisJob }>(`/analysis/jobs/${id}`),
};

export const shareApi = {
  get: (token: string) => request<{ conversation: PublicSharedConversation; readOnly: true }>(`/share/${token}`),
};

export const notificationsApi = {
  list: () => request<{ notifications: PublicNotification[] }>("/notifications"),
  markRead: (id: string) =>
    request<{ notification: PublicNotification }>(`/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () => request<{ ok: true; updated: number }>("/notifications/read-all", { method: "POST" }),
};
