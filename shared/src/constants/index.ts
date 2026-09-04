export const APP_NAME = "Ken AI";
export const APP_SERVICE_ID = "ken-api";

export const API_PREFIX = "/api";

export const USER_ROLES = ["user", "admin"] as const;

export const AUTH_PROVIDERS = ["local", "google"] as const;

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

/** Fast Groq default when GROQ_API_KEY (or a user Groq credential) is present. */
export const DEFAULT_GROQ_MODEL_ID = "qwen/qwen3.6-27b";

export const GROQ_OSS_20B_MODEL_ID = "openai/gpt-oss-20b";

/** Higher-quality Groq model used when the 20B id is unavailable. */
export const GROQ_QUALITY_MODEL_ID = "openai/gpt-oss-120b";

/**
 * Retired Groq IDs mapped onto models still served after the 2026-08-16 Llama shutdown.
 * One GROQ_API_KEY unlocks every Groq catalog entry; these aliases keep old chats working.
 */
export const GROQ_MODEL_ALIASES: Readonly<Record<string, string>> = {
  "llama-3.1-8b-instant": DEFAULT_GROQ_MODEL_ID,
  "llama3-8b-8192": DEFAULT_GROQ_MODEL_ID,
  "llama-3.3-70b-versatile": GROQ_QUALITY_MODEL_ID,
  "llama3-70b-8192": GROQ_QUALITY_MODEL_ID,
  "llama-3.1-70b-versatile": GROQ_QUALITY_MODEL_ID,
  "deepseek-r1-distill-llama-70b": GROQ_QUALITY_MODEL_ID,
};

export function resolveGroqModelId(modelId: string): string {
  return GROQ_MODEL_ALIASES[modelId] ?? modelId;
}

export const MAX_STORED_MESSAGE_TURNS = 100;

/** Unpinned chats and their messages auto-purge after 30 days. */
export const CONVERSATION_TTL_SECONDS = 2_592_000;

/** DeepSeek's public chat id. Requested "v4 flash" aliases onto this. */
export const DEFAULT_DEEPSEEK_MODEL_ID = "deepseek-chat";

export const DEEPSEEK_MODEL_ALIASES: Readonly<Record<string, string>> = {
  "deepseek-v4-flash": DEFAULT_DEEPSEEK_MODEL_ID,
};

export function resolveDeepSeekModelId(modelId: string): string {
  return DEEPSEEK_MODEL_ALIASES[modelId] ?? modelId;
}

export const DEFAULT_CEREBRAS_MODEL_ID = "llama-3.3-70b";

export const DEFAULT_CLOUDFLARE_MODEL_ID = "@cf/meta/llama-3.2-3b-instruct";

export const CLOUDFLARE_VISION_MODEL_ID = "@cf/meta/llama-4-scout-17b-16e-instruct";

/** Heuristic token estimate used in the composer and server context trimmer (~4 chars/token). */
export function estimatePromptTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Server-side safety cap. The composer does not impose a character limit. */
export const MAX_MESSAGE_CONTENT_CHARS = 1_000_000;

/** OpenAI hop when Groq is rate-limited and OPENAI_API_KEY is configured. */
export const DEFAULT_OPENAI_MODEL_ID = "gpt-4o-mini";

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
    verifyEmail: "/auth/verify-email",
    resendCode: "/auth/resend-code",
  },
  settings: {
    keys: "/settings/keys",
  },
  models: "/models",
  providers: "/providers",
  me: {
    providerCredentials: "/me/provider-credentials",
    providerCredentialTest: "/me/provider-credentials/:providerId/test",
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
  // Public legal pages. Reachable without an account: Google's OAuth consent
  // screen links to them, and a signed-out visitor must be able to read what
  // they are agreeing to before they register.
  privacy: "/privacy",
  terms: "/terms",
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  verifyEmail: "/verify-email",
  chat: "/chat",
  chatConversation: "/chat/:conversationId",
  share: "/share/:token",
  search: "/search",
  history: "/history",
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
