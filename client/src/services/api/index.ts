import { adminApi } from "./admin";
import { authApi } from "./auth";
import { chatApi, conversationsApi } from "./chat";
import { filesApi } from "./files";
import { gptsApi } from "./gpts";
import { analysisApi, healthApi, notificationsApi, shareApi } from "./misc";
import { instructionsApi, meApi, memoriesApi, settingsApi } from "./me";
import { modelsApi, providersApi } from "./models";
import { toolsApi } from "./tools";
import { voiceApi } from "./voice";

export { ApiError } from "./errors";
export { onUnauthorized } from "./client";
export type { AuthResponse, ChatStreamEvent, OkResponse, VerificationRequiredResponse } from "./types";

export const api = {
  health: healthApi,
  auth: authApi,
  models: modelsApi,
  providers: providersApi,
  me: meApi,
  settings: settingsApi,
  admin: adminApi,
  conversations: conversationsApi,
  chat: chatApi,
  files: filesApi,
  tools: toolsApi,
  voice: voiceApi,
  analysis: analysisApi,
  memories: memoriesApi,
  instructions: instructionsApi,
  gpts: gptsApi,
  share: shareApi,
  notifications: notificationsApi,
};
