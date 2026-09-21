import type { PublicAIModel } from "@Ken/shared";
import {
  CLOUDFLARE_VISION_MODEL_ID,
  resolveDeepSeekModelId,
  resolveGeminiModelId,
  resolveGroqModelId,
} from "@Ken/shared";
import { AppError } from "../../utils/AppError.js";
import type { ChatMessage } from "./AIProvider.js";
import {
  ATTACHMENT_ROUTE_REASON,
  attachmentNeedFromMessages,
  modelSatisfiesAttachmentNeed,
  pickMultimodalRoute,
  type AttachmentNeed,
  type AttachmentRoute,
} from "./attachmentRoute.js";
import { isProviderLeaveError } from "./fallback.js";
import { isProviderBlocked, nextOpenGeminiModelId, peekModelSkip } from "./modelSkip.js";
import { FREE_FALLBACK_CHAIN, pickConfiguredModel, preferredIdsForProvider } from "./primaryModel.js";

export interface HopTarget {
  providerId: string;
  modelId: string;
}

export interface HopRequest {
  providerId: string;
  modelId: string;
  messages?: ChatMessage[];
  /** Providers already failed this turn. Retry must not bounce back onto them. */
  blockedProviders?: readonly string[];
}

type Routable = Pick<PublicAIModel, "id" | "providerId" | "capabilities" | "available" | "enabled">;

/**
 * Providers that must not receive this turn: in-request blocks plus any
 * vendor-401 cooldown recorded on the provider.
 */
export function blockedProviderSet(request: HopRequest, extraIds: Iterable<string> = []): Set<string> {
  const blocked = new Set(request.blockedProviders ?? []);
  for (const id of extraIds) {
    if (id) blocked.add(id);
  }
  if (isProviderBlocked(request.providerId)) blocked.add(request.providerId);
  for (const id of [...blocked]) {
    if (isProviderBlocked(id)) blocked.add(id);
  }
  return blocked;
}

/** After an error, auth/client failures add the whole provider to the block list. */
export function providersBlockedAfterError(request: HopRequest, error: unknown): string[] {
  const blocked = blockedProviderSet(request);
  if (isProviderLeaveError(error)) blocked.add(request.providerId);
  return [...blocked];
}

/**
 * Pick a model that can receive the attachment. Auto passes `preferred`;
 * prepare/retry omit it and use the shared Gemini → OpenAI → Scout order.
 * Blocked providers are never candidates.
 */
export function pickAttachmentHop(
  models: readonly Routable[],
  requested: HopTarget,
  need: AttachmentNeed,
  options?: { blockedProviders?: Iterable<string>; preferred?: readonly HopTarget[] },
): AttachmentRoute | undefined {
  if (need === "none") {
    return { providerId: requested.providerId, modelId: requested.modelId, rerouted: false };
  }
  const blocked = new Set(options?.blockedProviders ?? []);
  const allowed = models.filter(
    (model) =>
      !blocked.has(model.providerId) &&
      !isProviderBlocked(model.providerId) &&
      !peekModelSkip(model.providerId, model.id),
  );
  if (options?.preferred) {
    for (const candidate of options.preferred) {
      if (blocked.has(candidate.providerId) || isProviderBlocked(candidate.providerId)) continue;
      const match = allowed.find(
        (model) =>
          model.providerId === candidate.providerId &&
          model.id === candidate.modelId &&
          model.enabled !== false &&
          model.available !== false &&
          modelSatisfiesAttachmentNeed(model.capabilities, need),
      );
      if (match) {
        return {
          providerId: match.providerId,
          modelId: match.id,
          rerouted: match.providerId !== requested.providerId || match.id !== requested.modelId,
          reason: `${ATTACHMENT_ROUTE_REASON}|${need}`,
        };
      }
    }
  }
  return pickMultimodalRoute(allowed, requested, need);
}

/**
 * Retry-path attachment gate. Files stay on the current hop so a Gemini 401 can
 * fail over to Groq reading the extracted text. Vision may hop, but never onto
 * a blocked provider.
 */
export function applyRetryAttachmentRoute(
  request: HopRequest,
  models: readonly Routable[],
): HopTarget & { rerouted: boolean; reason?: string } {
  const need = request.messages ? attachmentNeedFromMessages(request.messages) : "none";
  if (need === "none" || need === "files") {
    return { providerId: request.providerId, modelId: request.modelId, rerouted: false };
  }
  const blocked = blockedProviderSet(
    request,
    models.map((model) => model.providerId).filter((id) => isProviderBlocked(id)),
  );
  const picked = pickAttachmentHop(models, request, need, { blockedProviders: blocked });
  if (!picked) {
    throw new AppError(
      "No configured model can read this image. Add a Gemini or OpenAI key, then send again.",
      { statusCode: 409, code: "ATTACHMENT_ROUTE_UNAVAILABLE", expose: true },
    );
  }
  if (!picked.rerouted) {
    return { providerId: request.providerId, modelId: request.modelId, rerouted: false };
  }
  return {
    providerId: picked.providerId,
    modelId: picked.modelId,
    rerouted: true,
    ...(picked.reason ? { reason: picked.reason } : {}),
  };
}

export interface RetryHopInput {
  request: HopRequest;
  error: unknown;
  models: readonly Routable[];
  chain?: readonly HopTarget[];
  /** Constructor-level hop. When present (even empty), the free chain is not used. */
  explicitFallback?: { providerId?: string | undefined; modelId?: string | undefined };
  envFallback?: { providerId?: string | undefined; modelId?: string | undefined };
}

/**
 * Ordered retry targets after the primary failed. A 401/403 skips sibling
 * models on that provider and walks the next distinct provider that can
 * serve the payload.
 */
export function listRetryHops(input: RetryHopInput): HopTarget[] {
  const { request, error, models } = input;
  const blocked = new Set(providersBlockedAfterError(request, error));
  const need = request.messages ? attachmentNeedFromMessages(request.messages) : "none";
  const hops: HopTarget[] = [];
  const seen = new Set([`${request.providerId}:${request.modelId}`]);

  const addResolved = (hop: HopTarget, requireCatalog = true): void => {
    if (blocked.has(hop.providerId) || isProviderBlocked(hop.providerId)) return;
    if (peekModelSkip(hop.providerId, hop.modelId)) return;
    if (requireCatalog) {
      const catalog = models.find((model) => model.providerId === hop.providerId && model.id === hop.modelId);
      if (need === "files") {
        if (!catalog?.capabilities.includes("text")) return;
      } else if (!modelSatisfiesAttachmentNeed(catalog?.capabilities, need)) return;
    }
    const key = `${hop.providerId}:${hop.modelId}`;
    if (seen.has(key)) return;
    seen.add(key);
    hops.push(hop);
  };

  const addFromRegistry = (providerId: string | undefined, modelId?: string): void => {
    if (!providerId || blocked.has(providerId)) return;
    const match = matchFallback(request, models, providerId, modelId);
    if (!match) return;
    const hop =
      need === "vision" && match.providerId === "cloudflare"
        ? { providerId: "cloudflare", modelId: CLOUDFLARE_VISION_MODEL_ID }
        : { providerId: match.providerId, modelId: match.id };
    addResolved(hop);
  };

  // Sibling Gemini hops are catalog ids so a known 3.8 skip can start Lite
  // without another registry round-trip. Skip them after a vendor 401 — the
  // key is dead for every Gemini id.
  if (!isProviderLeaveError(error) && request.providerId === "gemini" && !blocked.has("gemini")) {
    let next = nextOpenGeminiModelId(request.modelId);
    const seenGemini = new Set<string>();
    while (next && !seenGemini.has(next)) {
      seenGemini.add(next);
      addResolved({ providerId: "gemini", modelId: next }, false);
      next = nextOpenGeminiModelId(next);
    }
  }

  if (input.explicitFallback) {
    addFromRegistry(input.explicitFallback.providerId, input.explicitFallback.modelId);
    return hops;
  }

  const chain = input.chain ?? FREE_FALLBACK_CHAIN;
  for (const step of chain) {
    if (request.providerId === "gemini" && step.providerId === "gemini") continue;
    addFromRegistry(step.providerId, step.modelId);
  }
  if (input.envFallback) {
    addFromRegistry(input.envFallback.providerId, input.envFallback.modelId);
  }
  return hops;
}

export function resolveRetiredModelId(providerId: string, modelId: string): string {
  if (providerId === "groq") return resolveGroqModelId(modelId);
  if (providerId === "gemini") return resolveGeminiModelId(modelId);
  if (providerId === "deepseek") return resolveDeepSeekModelId(modelId);
  return modelId;
}

function matchFallback(
  request: HopTarget,
  models: readonly Routable[],
  providerId: string | undefined,
  modelId?: string,
): { id: string; providerId: string } | undefined {
  const targetProvider = providerId?.trim();
  if (!targetProvider) return undefined;
  const desiredModelId = modelId ? resolveRetiredModelId(targetProvider, modelId) : undefined;
  const match = pickConfiguredModel(
    models.map((model) => ({ id: model.id, providerId: model.providerId })),
    targetProvider,
    preferredIdsForProvider(targetProvider),
    desiredModelId,
  );
  if (!match) return undefined;
  if (match.providerId === request.providerId && match.id === request.modelId) return undefined;
  return match;
}
