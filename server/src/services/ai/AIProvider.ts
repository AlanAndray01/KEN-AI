import type { MessageRole, ModelCapability, ProviderType } from "@Ken/shared";

export interface ChatContentPart {
  type: "inline";
  mimeType: string;
  data: string;
  filename?: string;
}

export interface ChatMessage {
  role: MessageRole;
  content: string;
  parts?: ChatContentPart[];
}

export interface ProviderCredentials {
  apiKey?: string;
  baseUrl?: string;
}

export interface ProviderModelDescriptor {
  id: string;
  name: string;
  description?: string;
  capabilities: ModelCapability[];
  contextWindow?: number;
}

export interface CredentialValidation {
  status: "connected" | "invalid" | "unavailable" | "error";
  message: string;
}

export interface AIUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AIResponse {
  content: string;
  model: string;
  provider: string;
  finishReason: "stop" | "length" | "tool_calls" | "error" | "unknown";
  usage?: AIUsage;
  citations?: unknown[];
  toolCalls?: unknown[];
  metadata?: Record<string, unknown>;
}

export type StreamEvent =
  | { type: "start"; model: string; provider: string }
  | { type: "connected"; model: string; provider: string; connectMs: number }
  | { type: "fallback"; model: string; provider: string; fallbackFrom: string; fallbackReason: string }
  | { type: "chunk"; text: string }
  | { type: "tool_call"; toolCall: unknown }
  | { type: "citation"; citation: unknown }
  | { type: "complete"; response: AIResponse }
  | { type: "error"; message: string; code?: string };

export interface GenerateRequest {
  providerId: string;
  modelId: string;
  messages: ChatMessage[];
  userId?: string;
  abortSignal?: AbortSignal;
  /** Caps the reply. Set for short internal calls so a chatty model cannot stall them. */
  maxTokens?: number;
  /**
   * Skips the shared-key chat quota. Only for internal calls the user did not
   * ask for - a chat title, say - so an auxiliary request never eats the
   * allowance meant for their actual messages, or fails their turn with a 429.
   */
  skipQuota?: boolean;
  /**
   * The chat path already confirmed this model in prepare(). Skipping the
   * second registry fan-out is what lets the Groq request start immediately
   * instead of waiting on another round of provider lookups.
   */
  skipAvailabilityCheck?: boolean;
  /**
   * Hint for Groq reasoning models. Greetings send `none` (Qwen) so the first
   * token is not delayed by a think phase.
   */
  reasoningEffort?: "none" | "low" | "medium" | "default";
  /** Correlates provider logs with the HTTP `x-request-id`. Never a secret. */
  requestId?: string;
  /**
   * Abort a hung connect/first-byte wait so a dead primary can fail over.
   * Only the first hop should set this — fallbacks need time to think.
   */
  firstByteTimeoutMs?: number;
  /**
   * How far the manager may stray from the requested model.
   *
   * `any` (the default) lets auxiliary calls - a chat title, say - fail over on
   * any retryable error, because nobody chose their model. `quota-only` is for a
   * turn whose model the user picked: it runs on exactly that model, and only a
   * provider quota error may move it, which the stream reports as a `fallback`
   * event so the UI can say so.
   */
  fallbackPolicy?: "any" | "quota-only";
}

export interface ProviderRuntimeConfig {
  id: string;
  name: string;
  type: ProviderType;
  credentials: ProviderCredentials;
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly type: ProviderType;
  generate(request: GenerateRequest): Promise<AIResponse>;
  stream?(request: GenerateRequest): AsyncIterable<StreamEvent>;
  generateWithTools?(request: GenerateRequest): Promise<AIResponse>;
  getModels(): Promise<ProviderModelDescriptor[]>;
  validateCredentials(credentials?: ProviderCredentials): Promise<CredentialValidation>;
  getCapabilities(): ModelCapability[];
}
