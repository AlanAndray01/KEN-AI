import type { ChatToolId, ModelCapability, PublicAnalysisJob, PublicTool } from "@aether/shared";
import { CLOUDFLARE_VISION_MODEL_ID, resolveDeepSeekModelId, resolveGroqModelId } from "@aether/shared";
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
import { requireConfigured, resolveCredentials, envKeyCount } from "./credentials.js";
import { consumePlatformChatQuota } from "./platformChatQuota.js";
import { isProviderQuotaError, isRetryableProviderError } from "./fallback.js";
import { modelRegistry } from "./ModelRegistry.js";
import { FREE_FALLBACK_CHAIN, pickConfiguredModel, preferredIdsForProvider } from "./primaryModel.js";

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
      let last: unknown = error;
      if (isProviderQuotaError(error) && envKeyCount(request.providerId) > 1) {
        try {
          return await this.generateOnce(request);
        } catch (rotated) {
          last = rotated;
        }
      }
      if (!isRetryableProviderError(last)) throw last;
      const hops = await this.fallbackHops(request);
      for (const hop of hops) {
        logger.warn(
          { primary: request.providerId, fallback: hop.providerId, fallbackModel: hop.modelId },
          "Primary provider failed; failing over immediately",
        );
        try {
          return await this.generateOnce(hop);
        } catch (next) {
          last = next;
          if (!isRetryableProviderError(next)) throw next;
        }
      }
      throw last;
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
      let last: unknown = error;
      if (isProviderQuotaError(error) && envKeyCount(request.providerId) > 1) {
        try {
          yield* this.streamOnce(request);
          return;
        } catch (rotated) {
          last = rotated;
        }
      }
      if (!isRetryableProviderError(last)) throw last;
      const hops = await this.fallbackHops(request);
      for (const hop of hops) {
        logger.warn(
          { primary: request.providerId, fallback: hop.providerId, fallbackModel: hop.modelId },
          "Primary provider failed; failing over immediately",
        );
        try {
          yield* this.streamOnce(hop);
          return;
        } catch (next) {
          last = next;
          if (!isRetryableProviderError(next)) throw next;
        }
      }
      throw last;
    }
  }

  private async generateOnce(request: GenerateRequest): Promise<AIResponse> {
    const resolved = this.withVisionModel(request);
    const adapter = await this.getAdapter(resolved.providerId, resolved.userId);
    await modelRegistry.assertModelAvailable(resolved.providerId, resolved.modelId, resolved.userId);
    return adapter.generate(resolved);
  }

  private async *streamOnce(request: GenerateRequest): AsyncIterable<StreamEvent> {
    const resolved = this.withVisionModel(request);
    const adapter = await this.getAdapter(resolved.providerId, resolved.userId);
    await modelRegistry.assertModelAvailable(resolved.providerId, resolved.modelId, resolved.userId);
    if (adapter.stream) {
      yield* adapter.stream(resolved);
      return;
    }

    yield { type: "start", model: resolved.modelId, provider: adapter.id };
    try {
      const response = await adapter.generate(resolved);
      if (response.content) {
        yield { type: "chunk", text: response.content };
      }
      yield { type: "complete", response };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Provider request failed";
      yield { type: "error", message, code: error instanceof AppError ? error.code : "PROVIDER_ERROR" };
    }
  }

  private withVisionModel(request: GenerateRequest): GenerateRequest {
    const hasImage = request.messages.some((message) =>
      message.parts?.some((part) => part.mimeType.startsWith("image/")),
    );
    if (!hasImage || request.providerId !== "cloudflare") return request;
    return { ...request, modelId: CLOUDFLARE_VISION_MODEL_ID };
  }

  private async fallbackHops(request: GenerateRequest): Promise<GenerateRequest[]> {
    const models = await modelRegistry.listPublicModels(request.userId);
    const hops: GenerateRequest[] = [];
    const seen = new Set([`${request.providerId}:${request.modelId}`]);

    const add = (providerId: string | undefined, modelId?: string): void => {
      const match = this.matchFallback(request, models, providerId, modelId);
      if (!match) return;
      const key = `${match.providerId}:${match.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      const hop: GenerateRequest = {
        providerId: match.providerId,
        modelId: match.id,
        messages: request.messages,
      };
      if (request.userId) hop.userId = request.userId;
      if (request.abortSignal) hop.abortSignal = request.abortSignal;
      hops.push(hop);
    };

    if (this.options.fallbackProviderId !== undefined) {
      add(this.options.fallbackProviderId, this.options.fallbackModelId);
      return hops;
    }

    for (const step of FREE_FALLBACK_CHAIN) {
      add(step.providerId, step.modelId);
    }
    add(env.AI_FALLBACK_PROVIDER_ID, this.fallbackModelId());
    if (hops.length === 0) {
      logger.warn(
        { providerId: request.providerId, modelId: request.modelId },
        "No configured fallback provider is available; a primary failure will surface to the user",
      );
    }
    return hops;
  }

  private matchFallback(
    request: GenerateRequest,
    models: Array<{ id: string; providerId: string }>,
    providerId: string | undefined,
    modelId?: string,
  ): { id: string; providerId: string } | undefined {
    const targetProvider = providerId?.trim();
    if (!targetProvider) return undefined;
    // A configured fallback may still name a retired id (Groq decommissioned
    // llama-3.3-70b-versatile). Those ids are filtered out of the registry, so
    // without aliasing the hop silently collapses onto the primary and the
    // fallback never runs.
    const desiredModelId = modelId ? resolveRetiredModelId(targetProvider, modelId) : undefined;
    const match = pickConfiguredModel(
      models,
      targetProvider,
      preferredIdsForProvider(targetProvider),
      desiredModelId,
    );
    if (!match) return undefined;
    if (match.providerId === request.providerId && match.id === request.modelId) return undefined;
    return match;
  }

  async getAdapter(providerId: string, userId?: string): Promise<AIProvider> {
    const resolved = requireConfigured(await resolveCredentials(providerId, userId));
    if (userId) {
      consumePlatformChatQuota(userId, resolved.source);
    }
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

/** Map a provider's retired model ids onto their supported replacements. */
function resolveRetiredModelId(providerId: string, modelId: string): string {
  if (providerId === "groq") return resolveGroqModelId(modelId);
  if (providerId === "deepseek") return resolveDeepSeekModelId(modelId);
  return modelId;
}

export const aiProviderManager = new AIProviderManager();
