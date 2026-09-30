import type { ChatToolId, ModelCapability, PublicAnalysisJob, PublicTool } from "@Ken/shared";
import {
  CLOUDFLARE_VISION_MODEL_ID,
  DEFAULT_GEMINI_MODEL_ID,
} from "@Ken/shared";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { combineAbortSignals } from "../../utils/abort.js";
import { AppError } from "../../utils/AppError.js";
import { telemetry } from "../../utils/telemetry.js";
import {
  toolManager,
  type ChatToolOutcome,
  type ToolExecuteResult,
  type ToolManager,
} from "../tools/ToolManager.js";
import { contextManager } from "../chat/ContextManager.js";
import { describeSelectedModel, withKenIdentity } from "../chat/identity.js";
import type { AIProvider, AIResponse, GenerateRequest, StreamEvent } from "./AIProvider.js";
import { createProviderAdapter } from "./createProviderAdapter.js";
import { requireConfigured, resolveCredentials, envKeyCount, type CredentialSource } from "./credentials.js";
import { GATEWAY_URL_PREFIX } from "./aiGateway.js";
import { providerReadsPdfNatively } from "./nativeDocuments.js";
import { foldInlineDocuments } from "../chat/documentParts.js";
import { consumePlatformChatQuota } from "./platformChatQuota.js";
import { assertUnderSpendCeiling } from "./spendCeiling.js";
import { isProviderLeaveError, isProviderQuotaError, isRetryableProviderError } from "./fallback.js";
import {
  formatFallbackReason,
  isProviderBlocked,
  peekModelSkip,
  rememberModelSkip,
  type ModelSkip,
} from "./modelSkip.js";
import { modelRegistry } from "./ModelRegistry.js";
import { guardStreamStalls, stallLimitsFor } from "./streamStallGuard.js";
import {
  applyRetryAttachmentRoute,
  listRetryHops,
  providersBlockedAfterError,
  resolveRetiredModelId,
  type HopTarget,
} from "./fallbackController.js";
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
    ctx: { userId: string; skipImageRateLimit?: boolean },
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

  async generate(input: GenerateRequest): Promise<AIResponse> {
    const request = await this.chargeTurnQuota(input);
    const skip = this.honouredSkip(request);
    if (skip) {
      this.logHonouredSkip(request, skip);
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

  async *stream(input: GenerateRequest): AsyncIterable<StreamEvent> {
    const request = await this.chargeTurnQuota(input);
    const skip = this.honouredSkip(request);
    if (skip) {
      this.logHonouredSkip(request, skip);
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
    if (!this.mayFallBack(request, last)) throw last;
    const models = await modelRegistry.listRoutableModels(request.userId);
    let blocked = providersBlockedAfterError(request, last);
    for (const hop of this.retryHops(request, last, models)) {
      if (blocked.includes(hop.providerId) || isProviderBlocked(hop.providerId)) continue;
      const next = this.hopRequest(request, hop, blocked);
      this.logFallback(request, next, last);
      try {
        return await this.generateOnce(next);
      } catch (caught) {
        last = caught;
        rememberModelSkip(hop.providerId, hop.modelId, caught);
        if (!isRetryableProviderError(caught)) throw caught;
        if (isProviderLeaveError(caught)) blocked = [...blocked, hop.providerId];
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
    // Once any text from an attempt has reached the user, a later failure ends
    // the turn with that text. Trying the next key or hop at that point would
    // stream a second, complete answer straight after the half-finished one.
    let streamedText = false;
    const tracked = async function* (events: AsyncIterable<StreamEvent>): AsyncIterable<StreamEvent> {
      for await (const event of events) {
        if (event.type === "chunk" || event.type === "complete") streamedText = true;
        yield event;
      }
    };
    if (allowKeyRotate && isProviderQuotaError(error) && envKeyCount(request.providerId) > 1) {
      try {
        yield* tracked(this.streamOnce(request));
        return;
      } catch (rotated) {
        if (streamedText) throw rotated;
        last = rotated;
        rememberModelSkip(request.providerId, request.modelId, rotated);
      }
    }
    if (!this.mayFallBack(request, last)) throw last;
    const models = await modelRegistry.listRoutableModels(request.userId);
    let blocked = providersBlockedAfterError(request, last);
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

    for (const hop of this.retryHops(request, last, models)) {
      if (blocked.includes(hop.providerId) || isProviderBlocked(hop.providerId)) continue;
      try {
        yield* tracked(tryHop.call(this, this.hopRequest(request, hop, blocked)));
        return;
      } catch (caught) {
        if (streamedText) throw caught;
        last = caught;
        rememberModelSkip(hop.providerId, hop.modelId, caught);
        if (!isRetryableProviderError(caught)) throw caught;
        if (isProviderLeaveError(caught)) blocked = [...blocked, hop.providerId];
      }
    }
    throw last;
  }

  /**
   * A cached cool-down for the requested model, if this request may act on it.
   *
   * A pinned turn only steps aside for a remembered quota error. A cached 503 or
   * first-byte timeout is transient, so the model the user chose is tried again
   * rather than being quietly replaced for the whole skip window.
   */
  private honouredSkip(request: GenerateRequest): ModelSkip | undefined {
    if (request.fallbackPolicy === "none") return undefined;
    const skip = peekModelSkip(request.providerId, request.modelId);
    if (!skip) return undefined;
    if (request.fallbackPolicy === "quota-only" && skip.code !== "PROVIDER_RATE_LIMITED") return undefined;
    return skip;
  }

  /**
   * Whether a failure may move the request onto a different model.
   *
   * A pinned turn (`fallbackPolicy: "none"`) never leaves the model the user
   * chose — quota, high demand, and cooldown all surface as an error so the
   * picker still matches the reply. Auto keeps retryable hops. `quota-only`
   * remains for callers that still opt into a quota hop.
   */
  private mayFallBack(request: GenerateRequest, error: unknown): boolean {
    if (request.fallbackPolicy === "none") return false;
    if (request.fallbackPolicy === "quota-only") return isProviderQuotaError(error);
    return isRetryableProviderError(error);
  }

  private logHonouredSkip(request: GenerateRequest, skip: ModelSkip): void {
    logger.warn(
      telemetry({
        event: "model_skip_honoured",
        requestId: request.requestId,
        providerId: request.providerId,
        modelId: request.modelId,
        skipReason: skip.reason,
        skipCode: skip.code,
        fallbackReason: skip.reason,
      }),
      "Skipping cooled-down model",
    );
  }

  private logFallback(request: GenerateRequest, hop: GenerateRequest, error: unknown): void {
    logger.warn(
      telemetry({
        event: "provider_failover",
        requestId: request.requestId,
        primary: request.providerId,
        primaryModel: request.modelId,
        fallback: hop.providerId,
        fallbackModel: hop.modelId,
        fallbackReason: formatFallbackReason(error),
        hop: true,
      }),
      "Primary provider failed; failing over immediately",
    );
  }

  private retryHops(
    request: GenerateRequest,
    error: unknown,
    models: Awaited<ReturnType<typeof modelRegistry.listRoutableModels>>,
  ): HopTarget[] {
    const hops = listRetryHops({
      request,
      error,
      models,
      ...(this.options.fallbackProviderId !== undefined
        ? {
            explicitFallback: {
              providerId: this.options.fallbackProviderId,
              modelId: this.options.fallbackModelId,
            },
          }
        : {
            envFallback: {
              providerId: env.AI_FALLBACK_PROVIDER_ID,
              modelId: this.fallbackModelId(),
            },
          }),
    });
    if (hops.length === 0) {
      logger.warn(
        telemetry({
          event: "provider_failover_exhausted",
          requestId: request.requestId,
          providerId: request.providerId,
          modelId: request.modelId,
          hop: false,
        }),
        "No configured fallback provider is available; a primary failure will surface to the user",
      );
    }
    return hops;
  }

  private hopRequest(request: GenerateRequest, hop: HopTarget, blocked: readonly string[]): GenerateRequest {
    const { firstByteTimeoutMs: _primaryTimeout, ...rest } = request;
    return {
      ...rest,
      providerId: hop.providerId,
      modelId: hop.modelId,
      blockedProviders: [...blocked],
    };
  }

  /**
   * Short first-byte budget on slower Gemini hops (3.8 / 3.6) only.
   * The Lite default is allowed to think so we do not bounce new chats onto 3.8.
   */
  private withPrimaryFirstByteTimeout(request: GenerateRequest): GenerateRequest {
    if (request.providerId !== "gemini" || request.firstByteTimeoutMs !== undefined) return request;
    // The short budget exists only to fail over. A pinned turn must not abort a
    // slow Pro/70B think just to hop; it has nowhere to hop to.
    if (request.fallbackPolicy === "quota-only" || request.fallbackPolicy === "none") return request;
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
      // Aborting this tears down only the provider request. The user's own
      // signal stays untouched, so a stall reads as a provider failure (which
      // Auto may hop away from) rather than as the user pressing Stop.
      const stall = new AbortController();
      yield* guardStreamStalls(
        adapter.stream({ ...resolved, abortSignal: combineAbortSignals(resolved.abortSignal, stall.signal) }),
        stallLimitsFor(resolved.reasoningEffort),
        (error) => {
          logger.warn(
            telemetry({
              event: "provider_stream_stall",
              requestId: resolved.requestId,
              providerId: resolved.providerId,
              modelId: resolved.modelId,
              errorClass: "stream_stall",
            }),
            error.message,
          );
          stall.abort(error);
        },
      );
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
    const resolved = this.withReadablePdfs(this.withVisionModel(aliased));
    const fitted = this.withProviderContextFit(resolved);
    const messages = withKenIdentity(fitted.messages, describeSelectedModel(fitted.modelId));
    return messages === fitted.messages ? fitted : { ...fitted, messages };
  }

  /**
   * The chat service builds context once, sized for whichever model the turn
   * *started* on — chatService.ts calls contextManager.build() a single time,
   * before the fallback chain runs. That is fine as long as every hop's real
   * window is roughly the same order of magnitude, which held until Cloudflare
   * gained a 70B option with a real 24k-token ceiling: a turn that started on
   * Gemini (sized for a 32k-token prompt) landing there via fallback would
   * carry a prompt already bigger than the model's entire budget, input and
   * output combined, and 400 on the one turn Cloudflare exists to save.
   *
   * Re-running the same trim here, scoped to whichever model is actually about
   * to receive the request, is a cheap, pure, and idempotent way to make every
   * hop respect its own real window rather than one built for the first hop.
   * It is a no-op whenever the incoming messages already fit — which is the
   * common case for every provider except this one.
   */
  /**
   * A PDF goes out once, as the file itself, to providers that read PDFs.
   * When a turn lands anywhere else (a fallback from Gemini to Groq, say),
   * the file would reach the model as a bare filename, so its text is
   * extracted here, for exactly the hop that needs it.
   */
  private withReadablePdfs(request: GenerateRequest): GenerateRequest {
    if (providerReadsPdfNatively(request.providerId)) return request;
    const hasPdf = request.messages.some((message) =>
      message.parts?.some((part) => part.mimeType === "application/pdf"),
    );
    if (!hasPdf) return request;
    return { ...request, messages: foldInlineDocuments(request.messages, { nativeDocuments: false }) };
  }

  private withProviderContextFit(request: GenerateRequest): GenerateRequest {
    const messages = contextManager.build({
      messages: request.messages,
      providerId: request.providerId,
      modelId: request.modelId,
    });
    return { ...request, messages };
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
    const models = await modelRegistry.listRoutableModels(request.userId);
    const routed = applyRetryAttachmentRoute(request, models);
    if (!routed.rerouted) return request;
    return { ...request, providerId: routed.providerId, modelId: routed.modelId };
  }

  /**
   * Charges the per-user platform limits once for the whole turn.
   *
   * Every attempt used to charge on its own — the key rotation and each
   * fallback hop went through getAdapter — so one message on a busy provider
   * could spend four or five units of the per-minute allowance. The limit ran
   * out fastest exactly when providers were struggling. Charging here and
   * marking the turn skipQuota makes one message cost one unit however many
   * providers it has to try.
   *
   * A primary on the user's own key is neither charged nor marked, so a hop
   * onto a shared platform key is still charged by getAdapter.
   */
  private async chargeTurnQuota(request: GenerateRequest): Promise<GenerateRequest> {
    if (!request.userId || request.skipQuota) return request;
    let source: CredentialSource;
    try {
      source = requireConfigured(await resolveCredentials(request.providerId, request.userId)).source;
    } catch {
      // An unconfigured primary is reported by the attempt itself, which may hop.
      return request;
    }
    if (source === "user") return request;
    await consumePlatformChatQuota(request.userId, source);
    await assertUnderSpendCeiling(request.userId, source);
    return { ...request, skipQuota: true };
  }

  async getAdapter(providerId: string, userId?: string, skipQuota?: boolean): Promise<AIProvider> {
    const resolved = requireConfigured(await resolveCredentials(providerId, userId));
    if (userId && !skipQuota) {
      await consumePlatformChatQuota(userId, resolved.source);
      await assertUnderSpendCeiling(userId, resolved.source);
    }
    return createProviderAdapter({
      id: resolved.providerId,
      name: resolved.name,
      type: resolved.type,
      credentials: {
        ...(resolved.apiKey ? { apiKey: resolved.apiKey } : {}),
        ...(resolved.baseUrl ? { baseUrl: resolved.baseUrl } : {}),
        // Derived from the URL actually chosen rather than passed down
        // separately, so the gateway header can never be attached to a request
        // that ended up going straight to the vendor, or omitted from one that
        // did not.
        ...(resolved.baseUrl?.startsWith(GATEWAY_URL_PREFIX) && env.CF_AI_GATEWAY_TOKEN
          ? { gatewayToken: env.CF_AI_GATEWAY_TOKEN }
          : {}),
      },
    });
  }

  async listConfiguredProviderIds(userId?: string): Promise<string[]> {
    const models = await modelRegistry.listPublicModels(userId);
    return [...new Set(models.map((model) => model.providerId))];
  }
}

export const aiProviderManager = new AIProviderManager();
