import type { AutoTask } from "../constants/index.js";
import type { ThemePreference, UserRole } from "./index.js";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type ModelCapability =
  | "text"
  | "vision"
  | "files"
  | "streaming"
  | "reasoning"
  | "tools"
  | "webSearch"
  | "imageGeneration"
  | "audio"
  | "structuredOutput";

export type ProviderType =
  | "gemini"
  | "openai"
  | "groq"
  | "openrouter"
  | "ollama"
  | "openai-compatible"
  | "custom";

export type GptVisibility = "private" | "unlisted" | "public";

export type GptCategory =
  | "programming"
  | "productivity"
  | "writing"
  | "research"
  | "education"
  | "business"
  | "design"
  | "data"
  | "other";

export type NotificationType =
  | "system"
  | "share"
  | "export"
  | "provider"
  | "security";

/** How the model picker is set: Auto routing, or a model the user chose. */
export type ModelSelectionMode = "auto" | "manual";

export interface UserPreferences {
  theme: ThemePreference;
  language: string;
  sendOnEnter: boolean;
  selectedProviderId?: string;
  selectedModelId?: string;
  /** "manual" makes the ids above follow the account; absent or "auto" means Auto. */
  selectionMode?: ModelSelectionMode;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  googleId?: string;
  avatar?: string;
  role: UserRole;
  preferences: UserPreferences;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface PublicAIModel {
  id: string;
  providerId: string;
  name: string;
  description?: string;
  capabilities: ModelCapability[];
  contextWindow?: number;
  enabled: boolean;
  available: boolean;
}

export type ProviderTestStatus =
  | "connected"
  | "invalid"
  | "unavailable"
  | "error"
  | "not_configured";

export interface PublicAIProvider {
  id: string;
  providerId: string;
  name: string;
  type: ProviderType;
  baseUrl?: string;
  enabled: boolean;
  configured: boolean;
  keyLastFour?: string;
  capabilities: ModelCapability[];
  lastTestStatus?: ProviderTestStatus;
  lastTestMessage?: string;
  source: "environment" | "database" | "user";
}

export interface PublicUserCredential {
  providerId: string;
  configured: boolean;
  enabled: boolean;
  keyLastFour?: string;
  baseUrl?: string;
}

export interface PublicCredentialTest {
  status: ProviderTestStatus;
  message: string;
}

export type MessageStatus = "streaming" | "complete" | "aborted" | "error";

export interface PublicMessageFeedback {
  rating: "up" | "down";
  comment?: string;
}

export interface PublicAttachment {
  id: string;
  fileId: string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: "image" | "document" | "audio" | "other";
}

export interface PublicFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: "image" | "document" | "audio" | "other";
  status: "uploaded" | "processing" | "ready" | "failed";
  createdAt: string;
  updatedAt: string;
}

export type ChatToolId = "web_search" | "image_generation" | "data_analysis";

export interface PublicTool {
  id: ChatToolId;
  name: string;
  description: string;
  configured: boolean;
  available: boolean;
  unavailableReason?: string;
}

export interface PublicSearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface PublicVoiceStatus {
  provider?: string;
  sttConfigured: boolean;
  ttsConfigured: boolean;
  message: string;
}

export type AnalysisJobStatus = "queued" | "running" | "succeeded" | "failed" | "rejected";

export interface PublicAnalysisJob {
  id: string;
  status: AnalysisJobStatus;
  language: "python";
  createdAt: string;
  message: string;
}

export interface PublicMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  model?: string;
  provider?: string;
  /** Set when Auto chose this model, naming what it routed for. */
  autoTask?: AutoTask;
  status: MessageStatus;
  parentMessageId?: string;
  feedback?: PublicMessageFeedback;
  generationId?: string;
  attachments?: PublicAttachment[];
  createdAt: string;
  updatedAt: string;
}

export type MemorySource = "manual" | "inferred";

export interface PublicMemory {
  id: string;
  content: string;
  source: MemorySource;
  conversationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicCustomInstruction {
  aboutUser: string;
  howToRespond: string;
  additional: string;
  updatedAt: string;
}

export interface PublicCustomGpt {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  instructions?: string;
  conversationStarters: string[];
  knowledgeFileIds: string[];
  capabilities: ModelCapability[];
  modelId?: string;
  providerId?: string;
  creatorId: string;
  visibility: GptVisibility;
  category: GptCategory;
  mine: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicConversation {
  id: string;
  title: string;
  modelId: string;
  providerId: string;
  customGptId?: string;
  archived: boolean;
  pinned: boolean;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ExportFormat = "md" | "json" | "txt";

export interface PublicShare {
  id: string;
  conversationId: string;
  token: string;
  url: string;
  isReadOnly: true;
  revoked: boolean;
  expiresAt?: string;
  viewCount: number;
  createdAt: string;
}

export interface PublicSharedMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface PublicSharedConversation {
  title: string;
  createdAt: string;
  messages: PublicSharedMessage[];
}

export interface PublicNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
}

export interface PublicUsageTotals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  successes: number;
  failures: number;
}

export interface PublicUsageByGroup {
  key: string;
  providerId: string;
  modelId?: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  successes: number;
  failures: number;
}

export interface PublicUsageRecord {
  id: string;
  providerId: string;
  modelId: string;
  requestCount: number;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  success: boolean;
  errorCode?: string;
  route?: string;
  createdAt: string;
}

export interface PublicUsageSummary {
  totals: PublicUsageTotals;
  byProvider: PublicUsageByGroup[];
  byModel: PublicUsageByGroup[];
  recent: PublicUsageRecord[];
}
