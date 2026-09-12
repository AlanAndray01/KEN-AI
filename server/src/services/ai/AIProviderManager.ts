import type { ChatToolId, ModelCapability, PublicAnalysisJob, PublicTool } from "@Ken/shared";
import {
  CLOUDFLARE_VISION_MODEL_ID,
  DEFAULT_GEMINI_MODEL_ID,
  resolveDeepSeekModelId,
  resolveGeminiModelId,
  resolveGroqModelId,
} from "@Ken/shared";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/AppError.js";
import {
  toolManager,
  type ChatToolOutcome,
  type ToolExecuteResult,
  type ToolManager,
} from "../tools/ToolManager.js";
import { describeSelectedModel, withKenIdentity } from "../chat/identity.js";
import type { AIProvider, AIResponse, GenerateRequest, StreamEvent } from "./AIProvider.js";
import { createProviderAdapter } from "./createProviderAdapter.js";
import { requireConfigured, resolveCredentials, envKeyCount } from "./credentials.js";
import { consumePlatformChatQuota } from "./platformChatQuota.js";
import { isProviderQuotaError, isRetryableProviderError } from "./fallback.js";
import { formatFallbackReason, nextOpenGeminiModelId, peekModelSkip, rememberModelSkip } from "./modelSkip.js";
import { modelRegistry } from "./ModelRegistry.js";
import {
  attachmentNeedFromMessages,
  modelSatisfiesAttachmentNeed,
  pickMultimodalRoute,
} from "./attachmentRoute.js";
import { FREE_FALLBACK_CHAIN, pickConfiguredModel, preferredIdsForProvider } from "./primaryModel.js";
import { GEMINI_FIRST_BYTE_TIMEOUT_MS } from "./providers/OpenAICompatibleProvider.js";

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
    const skip = peekModelSkip(request.providerId, request.modelId);
    if (skip) {
      logger.warn(
        {
          requestId: request.requestId,
          providerId: request.providerId,
          modelId: request.modelId,
          fallbackReason: skip.reason,
        },
        "Skipping cooled-down model",
      );
      return this.generateFromError(
        request,
        new AppError("Provider rate limit reached.", {
          statusCode: skip.code === "PROVIDER_UNAVAILABLE" ? 503 : 429,
          code: skip.code,
          extra: { errorClass: skip.reason },
        }),
        false,
      );
    }
    try {
      return await this.generateOnce(this.withPrimaryFirstByteTimeout(request));
    } catch (error) {
      rememberModelSkip(request.providerId, request.modelId, error);
      return this.generateFromError(request, error, true);
    }
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamEvent> {
    const skip = peekModelSkip(request.providerId, request.modelId);
    if (skip) {
      logger.warn(
        {
          requestId: request.requestId,
          providerId: request.providerId,
          modelId: request.modelId,
          fallbackReason: skip.reason,
        },
        "Skipping cooled-down model",
      );
      yield* this.streamFromError(
        request,
        new AppError("Provider rate limit reached.", {
          statusCode: skip.code === "PROVIDER_UNAVAILABLE" ? 503 : 429,
          code: skip.code,
        }),
        false,
        skip.reason,
      );
      return;
    }

    let yieldedOutput = false;
    try {
      for await (const event of this.streamOnce(this.withPrimaryFirstByteTimeout(request))) {
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
      rememberModelSkip(request.providerId, request.modelId, error);
      yield* this.streamFromError(request, error, true);
    }
  }

  private async generateFromError(
    request: GenerateRequest,
    error: unknown,
    allowKeyRotate: boolean,
  ): Promise<AIResponse> {
    let last: unknown = error;
    if (allowKeyRotate && isProviderQuotaError(error) && envKeyCount(request.providerId) > 1) {
      try {
        return await this.generateOnce(request);
      } catch (rotated) {
        last = rotated;
        rememberModelSkip(request.providerId, request.modelId, rotated);
      }
    }
    if (!isRetryableProviderError(last)) throw last;
    for (const hop of this.geminiCatalogHops(request)) {
      this.logFallback(request, hop, last);
      try {
        return await this.generateOnce(hop);
      } catch (next) {
        last = next;
        rememberModelSkip(hop.providerId, hop.modelId, next);
        if (!isRetryableProviderError(next)) throw next;
      }
    }
    for (const hop of await this.remainingHops(request)) {
      if (peekModelSkip(hop.providerId, hop.modelId)) continue;
      this.logFallback(request, hop, last);
      try {
        return await this.generateOnce(hop);
      } catch (next) {
        last = next;
        rememberModelSkip(hop.providerId, hop.modelId, next);
        if (!isRetryableProviderError(next)) throw next;
      }
    }
    throw last;
  }

  private async *streamFromError(
    request: GenerateRequest,
    error: unknown,
    allowKeyRotate: boolean,
    reasonOverride?: string,
  ): AsyncIterable<StreamEvent> {
    let last: unknown = error;
    if (allowKeyRotate && isProviderQuotaError(error) && envKeyCount(request.providerId) > 1) {
      try {
        yield* this.streamOnce(request);
        return;
      } catch (rotated) {
        last = rotated;
        rememberModelSkip(request.providerId, request.modelId, rotated);
      }
    }
    if (!isRetryableProviderError(last)) throw last;
    const tryHop = async function* (this: AIProviderManager, hop: GenerateRequest): AsyncIterable<StreamEvent> {
      const fallbackReason = reasonOverride ?? formatFallbackReason(last);
      this.logFallback(request, hop, last);
      yield {
        type: "fallback",
        model: hop.modelId,
        provider: hop.providerId,
        fallbackFrom: request.modelId,
        fallbackReason,
      };
      yield* this.streamOnce(hop);
    };

    for (const hop of this.geminiCatalogHops(request)) {
      try {
        yield* tryHop.call(this, hop);
        return;
      } catch (next) {
        last = next;
        rememberModelSkip(hop.providerId, hop.modelId, next);
        if (!isRetryableProviderError(next)) throw next;
      }
    }
    for (const hop of await this.remainingHops(request)) {
      if (peekModelSkip(hop.providerId, hop.modelId)) continue;
      try {
        yield* tryHop.call(this, hop);
        return;
      } catch (next) {
        last = next;
        rememberModelSkip(hop.providerId, hop.modelId, next);
        if (!isRetryableProviderError(next)) throw next;
      }
    }
    throw last;
  }

  private logFallback(request: GenerateRequest, hop: GenerateRequest, error: unknown): void {
    logger.warn(
      {
        requestId: request.requestId,
        primary: request.providerId,
        primaryModel: request.modelId,
        fallback: hop.providerId,
        fallbackModel: hop.modelId,
        fallbackReason: formatFallbackReason(error),
      },
      "Primary provider failed; failing over immediately",
    );
  }

  /**
   * Gemini hops come from the catalog (no registry fan-out) so a known 3.8
   * skip can start Lite on the same tick. Other providers load only if Gemini
   * is actually exhausted.
   */
  private async hopsFor(request: GenerateRequest): Promise<GenerateRequest[]> {
    const catalog = this.geminiCatalogHops(request);
    if (request.providerId === "gemini") {
      const rest = (await this.fallbackHops(request)).filter((hop) => hop.providerId !== "gemini");
      return [...catalog, ...rest];
    }
    return this.orderHops(request, await this.fallbackHops(request));
  }

  private geminiCatalogHops(request: GenerateRequest): GenerateRequest[] {
    if (request.providerId !== "gemini") return [];
    const hops: GenerateRequest[] = [];
    let next = nextOpenGeminiModelId(request.modelId);
    const seen = new Set<string>();
    while (next && !seen.has(next)) {
      seen.add(next);
      const { firstByteTimeoutMs: _timeout, ...rest } = request;
      hops.push({ ...rest, providerId: "gemini", modelId: next });
      next = nextOpenGeminiModelId(next);
    }
    return hops;
  }

  private async remainingHops(request: GenerateRequest): Promise<GenerateRequest[]> {
    const hops = await this.fallbackHops(request);
    if (request.providerId === "gemini") {
      return hops.filter((hop) => hop.providerId !== "gemini");
    }
    return this.orderHops(request, hops);
  }

  /**
   * A Gemini-selected chat stays on Gemini hops first. Groq (and the rest of
   * the free chain) only run after every configured Gemini model has failed.
   */
  private orderHops(request: GenerateRequest, hops: GenerateRequest[]): GenerateRequest[] {
    if (request.providerId !== "gemini") return hops;
    return [
      ...hops.filter((hop) => hop.providerId === "gemini"),
      ...hops.filter((hop) => hop.providerId !== "gemini"),
    ];
  }

  /**
   * Short first-byte budget on slower Gemini hops (3.8 / 3.6) only.
   * The Lite default is allowed to think so we do not bounce new chats onto 3.8.
   */
  private withPrimaryFirstByteTimeout(request: GenerateRequest): GenerateRequest {
    if (request.providerId !== "gemini" || request.firstByteTimeoutMs !== undefined) return request;
    if (request.modelId === DEFAULT_GEMINI_MODEL_ID) return request;
    return { ...request, firstByteTimeoutMs: GEMINI_FIRST_BYTE_TIMEOUT_MS };
  }

  private async generateOnce(request: GenerateRequest): Promise<AIResponse> {
    const resolved = this.prepareRequest(await this.withAttachmentRoute(request));
    const adapter = await this.getAdapter(resolved.providerId, resolved.userId, resolved.skipQuota);
    if (!resolved.skipAvailabilityCheck) {
      await modelRegistry.assertModelAvailable(resolved.providerId, resolved.modelId, resolved.userId);
    }
    return adapter.generate(resolved);
  }

  private async *streamOnce(request: GenerateRequest): AsyncIterable<StreamEvent> {
    const routed = await this.withAttachmentRoute(request);
    if (routed.providerId !== request.providerId || routed.modelId !== request.modelId) {
      yield {
        type: "fallback",
        model: routed.modelId,
        provider: routed.providerId,
        fallbackFrom: request.modelId,
        fallbackReason: "ATTACHMENT_ROUTE",
      };
    }
    const resolved = this.prepareRequest(routed);
    const adapter = await this.getAdapter(resolved.providerId, resolved.userId, resolved.skipQuota);
    if (!resolved.skipAvailabilityCheck) {
      await modelRegistry.assertModelAvailable(resolved.providerId, resolved.modelId, resolved.userId);
    }
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

  /**
   * Every model call in the app funnels through generateOnce/streamOnce, so
   * this is the one place that can guarantee the assistant knows it is Ken AI
   * no matter which route built the prompt.
   */
  private prepareRequest(request: GenerateRequest): GenerateRequest {
    const aliased = this.withAliasedModel(request);
    const resolved = this.withVisionModel(aliased);
    const messages = withKenIdentity(resolved.messages, describeSelectedModel(resolved.modelId));
    return messages === resolved.messages ? resolved : { ...resolved, messages };
  }

  private withAliasedModel(request: GenerateRequest): GenerateRequest {
    const modelId = resolveRetiredModelId(request.providerId, request.modelId);
    return modelId === request.modelId ? request : { ...request, modelId };
  }

  private withVisionModel(request: GenerateRequest): GenerateRequest {
    const hasImage = request.messages.some((message) =>
      message.parts?.some((part) => part.mimeType.startsWith("image/")),
    );
    if (!hasImage || request.providerId !== "cloudflare") return request;
    return { ...request, modelId: CLOUDFLARE_VISION_MODEL_ID };
  }

  private async withAttachmentRoute(request: GenerateRequest): Promise<GenerateRequest> {
    const need = attachmentNeedFromMessages(request.messages);
    if (need === "none") return request;
    const models = await modelRegistry.listRoutableModels(request.userId);
    const picked = pickMultimodalRoute(models, request, need);
    if (!picked) {
      throw new AppError(
        need === "files"
          ? "No configured model can read this PDF. Add a Gemini, OpenAI, or Anthropic key, then send again."
          : "No configured model can read this image. Add a Gemini, OpenAI, or Anthropic key, then send again.",
        { statusCode: 409, code: "ATTACHMENT_ROUTE_UNAVAILABLE", expose: true },
      );
    }
    if (!picked.rerouted) return request;
    return { ...request, providerId: picked.providerId, modelId: picked.modelId };
  }

  private async fallbackHops(request: GenerateRequest): Promise<GenerateRequest[]> {
    const models = await modelRegistry.listRoutableModels(request.userId);
    const hops: GenerateRequest[] = [];
    const seen = new Set([`${request.providerId}:${request.modelId}`]);

    const need = attachmentNeedFromMessages(request.messages);
    const add = (providerId: string | undefined, modelId?: string): void => {
      const match = this.matchFallback(request, models, providerId, modelId);
      if (!match) return;
      const catalog = models.find((model) => model.providerId === match.providerId && model.id === match.id);
      if (!modelSatisfiesAttachmentNeed(catalog?.capabilities, need)) return;
      const key = `${match.providerId}:${match.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      const { firstByteTimeoutMs: _primaryTimeout, ...rest } = request;
      hops.push({
        ...rest,
        providerId: match.providerId,
        modelId: match.id,
      });
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

  async getAdapter(providerId: string, userId?: string, skipQuota?: boolean): Promise<AIProvider> {
    const resolved = requireConfigured(await resolveCredentials(providerId, userId));
    if (userId && !skipQuota) {
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
  if (providerId === "gemini") return resolveGeminiModelId(modelId);
  if (providerId === "deepseek") return resolveDeepSeekModelId(modelId);
  return modelId;
}

export const aiProviderManager = new AIProviderManager();
