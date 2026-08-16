import type { ChatToolId, ModelCapability, PublicAnalysisJob, PublicTool } from "@aether/shared";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/AppError.js";
import {
  toolManager,
  type ChatToolOutcome,
  type ToolExecuteResult,
  type ToolManager,
} from "../tools/ToolManager.js";
import type { AIProvider, AIResponse, GenerateRequest, StreamEvent } from "./AIProvider.js";
import { createProviderAdapter } from "./createProviderAdapter.js";
import { requireConfigured, resolveCredentials } from "./credentials.js";
import { isRetryableProviderError } from "./fallback.js";
import { modelRegistry } from "./ModelRegistry.js";

export interface AIProviderManagerOptions {
  fallbackProviderId?: string;
  fallbackModelId?: string;
  tools?: ToolManager;
}

export class AIProviderManager {
  private readonly tools: ToolManager;
  private readonly options: AIProviderManagerOptions;

  constructor(options: AIProviderManagerOptions = {}) {
    this.tools = options.tools ?? toolManager;
    this.options = options;
  }

  private fallbackProviderId(): string | undefined {
    return this.options.fallbackProviderId ?? env.AI_FALLBACK_PROVIDER_ID;
  }

  private fallbackModelId(): string | undefined {
    return this.options.fallbackModelId ?? env.AI_FALLBACK_MODEL_ID;
  }

  listTools(capabilities?: ModelCapability[]): PublicTool[] {
    return this.tools.listPublic(capabilities);
  }

  runTool(
    name: ChatToolId,
    args: { query?: string; prompt?: string; code?: string; fileIds?: string[]; language?: "python" },
    ctx: { userId: string },
  ): Promise<ToolExecuteResult> {
    return this.tools.execute(name, args, ctx);
  }

  applyEnabledTools(input: {
    enabledTools?: ChatToolId[];
    content: string;
    userId: string;
    capabilities: ModelCapability[];
  }): Promise<ChatToolOutcome> {
    return this.tools.applyForChat(input);
  }

  getAnalysisJob(userId: string, jobId: string): Promise<PublicAnalysisJob> {
    return this.tools.getAnalysisJob(userId, jobId);
  }

  async generate(request: GenerateRequest): Promise<AIResponse> {
    try {
      return await this.generateOnce(request);
    } catch (error) {
      const fallback = await this.buildFallbackRequest(request, error);
      if (!fallback) throw error;
      logger.warn(
        { primary: request.providerId, fallback: fallback.providerId },
        "Primary provider failed; using configured fallback provider",
      );
      return this.generateOnce(fallback);
    }
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamEvent> {
    let yieldedOutput = false;
    try {
      for await (const event of this.streamOnce(request)) {
        if (event.type === "error" && !yieldedOutput) {
          throw new AppError(event.message, {
            statusCode: 502,
            code: event.code ?? "PROVIDER_ERROR",
          });
        }
        if (event.type === "chunk" || event.type === "complete") {
          yieldedOutput = true;
        }
        yield event;
      }
    } catch (error) {
      if (yieldedOutput) throw error;
      const fallback = await this.buildFallbackRequest(request, error);
      if (!fallback) throw error;
      logger.warn(
        { primary: request.providerId, fallback: fallback.providerId },
        "Primary provider failed; using configured fallback provider",
      );
      yield* this.streamOnce(fallback);
    }
  }

  private async generateOnce(request: GenerateRequest): Promise<AIResponse> {
    const adapter = await this.getAdapter(request.providerId, request.userId);
    await modelRegistry.assertModelAvailable(request.providerId, request.modelId, request.userId);
    return adapter.generate(request);
  }

  private async *streamOnce(request: GenerateRequest): AsyncIterable<StreamEvent> {
    const adapter = await this.getAdapter(request.providerId, request.userId);
    await modelRegistry.assertModelAvailable(request.providerId, request.modelId, request.userId);
    if (adapter.stream) {
      yield* adapter.stream(request);
      return;
    }

    yield { type: "start", model: request.modelId, provider: adapter.id };
    try {
      const response = await adapter.generate(request);
      if (response.content) {
        yield { type: "chunk", text: response.content };
      }
      yield { type: "complete", response };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Provider request failed";
      yield { type: "error", message, code: error instanceof AppError ? error.code : "PROVIDER_ERROR" };
    }
  }

  private async buildFallbackRequest(request: GenerateRequest, error: unknown): Promise<GenerateRequest | undefined> {
    const fallbackProviderId = this.fallbackProviderId();
    if (!fallbackProviderId || fallbackProviderId === request.providerId) return undefined;
    if (!isRetryableProviderError(error)) return undefined;

    const resolved = await resolveCredentials(fallbackProviderId, request.userId);
    if (!resolved?.configured || !resolved.enabled) return undefined;

    const models = await modelRegistry.listPublicModels(request.userId);
    const configuredModelId = this.fallbackModelId();
    const match = configuredModelId
      ? models.find((model) => model.providerId === fallbackProviderId && model.id === configuredModelId)
      : models.find((model) => model.providerId === fallbackProviderId);
    if (!match) return undefined;

    const fallback: GenerateRequest = {
      providerId: fallbackProviderId,
      modelId: match.id,
      messages: request.messages,
    };
    if (request.userId) fallback.userId = request.userId;
    if (request.abortSignal) fallback.abortSignal = request.abortSignal;
    return fallback;
  }

  async getAdapter(providerId: string, userId?: string): Promise<AIProvider> {
    const resolved = requireConfigured(await resolveCredentials(providerId, userId));
    return createProviderAdapter({
      id: resolved.providerId,
      name: resolved.name,
      type: resolved.type,
      credentials: {
        ...(resolved.apiKey ? { apiKey: resolved.apiKey } : {}),
        ...(resolved.baseUrl ? { baseUrl: resolved.baseUrl } : {}),
      },
    });
  }

  async listConfiguredProviderIds(userId?: string): Promise<string[]> {
    const models = await modelRegistry.listPublicModels(userId);
    return [...new Set(models.map((model) => model.providerId))];
  }
}

export const aiProviderManager = new AIProviderManager();
