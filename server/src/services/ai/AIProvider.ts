import type { MessageRole, ModelCapability, ProviderType } from "@aether/shared";

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
