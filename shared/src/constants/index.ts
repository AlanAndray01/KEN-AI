export const APP_NAME = "Aether";
export const APP_SERVICE_ID = "aether-api";

export const API_PREFIX = "/api";

export const USER_ROLES = ["user", "admin"] as const;

export const MESSAGE_ROLES = ["user", "assistant", "system", "tool"] as const;

export const MESSAGE_STATUSES = ["streaming", "complete", "aborted", "error"] as const;

export const MODEL_CAPABILITIES = [
  "text",
  "vision",
  "files",
  "streaming",
  "reasoning",
  "tools",
  "webSearch",
  "imageGeneration",
  "audio",
  "structuredOutput",
] as const;

export const PROVIDER_TYPES = [
  "gemini",
  "openai",
  "anthropic",
  "groq",
  "openrouter",
  "ollama",
  "openai-compatible",
  "custom",
] as const;

export const FILE_KINDS = ["image", "document", "audio", "other"] as const;

export const FILE_STATUSES = ["uploaded", "processing", "ready", "failed"] as const;

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
] as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const MAX_ATTACHMENTS_PER_MESSAGE = 8;

export const CHAT_TOOL_IDS = ["web_search", "image_generation", "data_analysis"] as const;

export const ANALYSIS_JOB_STATUSES = ["queued", "running", "succeeded", "failed", "rejected"] as const;

export const MEMORY_SOURCES = ["manual", "inferred"] as const;

export const GPT_VISIBILITY = ["private", "unlisted", "public"] as const;

export const GPT_CATEGORIES = [
  "programming",
  "productivity",
  "writing",
  "research",
  "education",
  "business",
  "design",
  "data",
  "other",
] as const;

export const EXPORT_FORMATS = ["md", "json", "txt"] as const;

export const NOTIFICATION_TYPES = ["system", "share", "export", "provider", "security"] as const;

export const UI_LANGUAGES = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
  { id: "fr", label: "Français" },
  { id: "de", label: "Deutsch" },
  { id: "ja", label: "日本語" },
  { id: "zh", label: "中文" },
] as const;

export const API_ROUTES = {
  health: "/health",
  auth: {
    register: "/auth/register",
    login: "/auth/login",
    google: "/auth/google",
    googleCallback: "/auth/google/callback",
    logout: "/auth/logout",
    me: "/auth/me",
    refresh: "/auth/refresh",
    forgotPassword: "/auth/forgot-password",
    resetPassword: "/auth/reset-password",
    changePassword: "/auth/change-password",
  },
  models: "/models",
  providers: "/providers",
  me: {
    providerCredentials: "/me/provider-credentials",
    instructions: "/me/instructions",
    usage: "/me/usage",
    export: "/me/export",
  },
  conversations: "/conversations",
  chat: "/chat",
  files: "/files",
  tools: "/tools",
  voice: "/voice",
  analysis: "/analysis",
  memories: "/memories",
  gpts: "/gpts",
  share: "/share",
  notifications: "/notifications",
  admin: {
    providers: "/admin/providers",
    models: "/admin/models",
    usage: "/admin/usage",
  },
} as const;

export const CLIENT_ROUTES = {
  home: "/",
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  chat: "/chat",
  chatConversation: "/chat/:conversationId",
  share: "/share/:token",
  search: "/search",
  library: "/library",
  gpts: "/gpts",
  gptDetail: "/gpts/:id",
  gptCreate: "/gpts/create",
  settings: "/settings",
  settingsAccount: "/settings/account",
  settingsGeneral: "/settings/general",
  settingsAppearance: "/settings/appearance",
  settingsPersonalization: "/settings/personalization",
  settingsMemory: "/settings/memory",
  settingsVoice: "/settings/voice",
  settingsNotifications: "/settings/notifications",
  settingsDataControls: "/settings/data-controls",
  settingsModels: "/settings/models",
  adminProviders: "/admin/providers",
  adminModels: "/admin/models",
  adminUsage: "/admin/usage",
} as const;
