import {
  CLOUDFLARE_TINY_MODEL_ID,
  DEFAULT_CLOUDFLARE_MODEL_ID,
  DEFAULT_GEMINI_MODEL_ID,
  DEFAULT_GROQ_MODEL_ID,
  DEFAULT_OPENAI_MODEL_ID,
  GEMINI_FLASH_2_MODEL_ID,
  GEMINI_FLASH_MODEL_ID,
  GEMINI_PRO_MODEL_ID,
  GROQ_OSS_20B_MODEL_ID,
  GROQ_QUALITY_MODEL_ID,
  isCloudflareImageModel,
  type AutoTask,
} from "@Ken/shared";
import type { ChatMessage } from "../ai/AIProvider.js";
import type { AttachmentNeed } from "../ai/attachmentRoute.js";
import { classifyAutoTask, type AutoTaskInput, type RoutableModel } from "./autoRoute.js";
import { contextManager, MAX_HISTORY_MESSAGES, providerInputTokens } from "./ContextManager.js";

/**
 * Two-rung spend ladder. Lite is greetings, short facts, and structural
 * how-tos; large is proofs, deep code, and document-sized pastes. Attachment
 * and tool turns stay lite for *prune* (tight history) but are never
 * downshifted off a model that can actually see the file.
 */
export type NeuronTier = "lite" | "large";

export const NEURON_GUARD_REASON = "NEURON_GUARD|lite";

/** Prefill ceiling for a lite turn. Identity + a short question still fit. */
export const LITE_INPUT_TOKENS = 1_536;

/** Two exchanges plus the current question. */
export const LITE_MAX_HISTORY_MESSAGES = 4;

const LITE_CLOUDFLARE_OUTPUT_TOKENS = 768;
const LARGE_CLOUDFLARE_OUTPUT_TOKENS = 2_048;

const LARGE_TASKS: ReadonlySet<AutoTask> = new Set(["code", "reasoning", "longContext"]);

const HEAVY_MODEL_ID = /70b|120b|32b|scout|nemotron|gpt-4\.1|pro-preview|llama-3\.3/i;

/**
 * Same-provider lite hops, cheapest first. Never lists Cloudflare for a
 * Groq/Gemini/OpenAI source — that would spend Workers AI neurons to "save"
 * a provider that is not metered that way.
 */
const SAME_PROVIDER_LITE: Readonly<Record<string, readonly string[]>> = {
  groq: [DEFAULT_GROQ_MODEL_ID, GROQ_OSS_20B_MODEL_ID],
  gemini: [DEFAULT_GEMINI_MODEL_ID, GEMINI_FLASH_MODEL_ID, GEMINI_FLASH_2_MODEL_ID],
  openai: [DEFAULT_OPENAI_MODEL_ID],
  cloudflare: [DEFAULT_CLOUDFLARE_MODEL_ID, CLOUDFLARE_TINY_MODEL_ID],
};

const CROSS_PROVIDER_LITE: ReadonlyArray<{ providerId: string; modelId: string }> = [
  { providerId: "groq", modelId: DEFAULT_GROQ_MODEL_ID },
  { providerId: "gemini", modelId: DEFAULT_GEMINI_MODEL_ID },
  { providerId: "openai", modelId: DEFAULT_OPENAI_MODEL_ID },
];

export function classifyNeuronTier(input: AutoTask | AutoTaskInput): NeuronTier {
  const task = typeof input === "string" ? input : classifyAutoTask(input);
  return LARGE_TASKS.has(task) ? "large" : "lite";
}

export function isHeavyNeuronModel(providerId: string, modelId: string): boolean {
  if (isCloudflareImageModel(modelId)) return false;
  if (providerId === "cerebras" || providerId === "deepseek") return true;
  if (providerId === "groq") return modelId === GROQ_QUALITY_MODEL_ID;
  if (providerId === "gemini") return modelId === GEMINI_PRO_MODEL_ID;
  return HEAVY_MODEL_ID.test(modelId);
}

export function neuronInputBudget(tier: NeuronTier, providerId: string): number {
  const provider = providerInputTokens(providerId);
  return tier === "lite" ? Math.min(provider, LITE_INPUT_TOKENS) : provider;
}

export function neuronMaxHistory(tier: NeuronTier): number {
  return tier === "lite" ? LITE_MAX_HISTORY_MESSAGES : MAX_HISTORY_MESSAGES;
}

export function neuronOutputTokens(tier: NeuronTier, providerId: string, requested: number): number {
  if (providerId !== "cloudflare") return requested;
  const cap = tier === "lite" ? LITE_CLOUDFLARE_OUTPUT_TOKENS : LARGE_CLOUDFLARE_OUTPUT_TOKENS;
  return Math.min(requested, cap);
}

export interface NeuronRoute {
  providerId: string;
  modelId: string;
  downshifted: boolean;
}

/**
 * Auto-only: replace a heavyweight pick with Flash/Lite on the same provider,
 * or Groq/Gemini/OpenAI lite if that provider has no small model. Pinned
 * selections and vision/file hops are left alone.
 */
export function downshiftForNeurons(input: {
  providerId: string;
  modelId: string;
  models: readonly RoutableModel[];
  tier: NeuronTier;
  pinned?: boolean;
  need?: AttachmentNeed;
}): NeuronRoute {
  const selected = { providerId: input.providerId, modelId: input.modelId, downshifted: false };
  if (input.pinned || input.tier !== "lite") return selected;
  if (input.need === "vision" || input.need === "files") return selected;
  if (isCloudflareImageModel(input.modelId)) return selected;
  if (!isHeavyNeuronModel(input.providerId, input.modelId)) return selected;

  const match = (providerId: string, modelId: string): RoutableModel | undefined =>
    input.models.find(
      (model) =>
        model.providerId === providerId &&
        model.id === modelId &&
        model.enabled !== false &&
        model.available &&
        model.capabilities.includes("text"),
    );

  for (const modelId of SAME_PROVIDER_LITE[input.providerId] ?? []) {
    const found = match(input.providerId, modelId);
    if (found) return { providerId: found.providerId, modelId: found.id, downshifted: true };
  }

  if (input.providerId === "cloudflare") return selected;

  for (const candidate of CROSS_PROVIDER_LITE) {
    if (candidate.providerId === input.providerId) continue;
    const found = match(candidate.providerId, candidate.modelId);
    if (found) return { providerId: found.providerId, modelId: found.id, downshifted: true };
  }
  return selected;
}

export function pruneTurnContext(input: {
  messages: ChatMessage[];
  providerId: string;
  modelId: string;
  tier: NeuronTier;
  contextWindow?: number;
}): ChatMessage[] {
  return contextManager.build({
    messages: input.messages,
    providerId: input.providerId,
    modelId: input.modelId,
    ...(input.contextWindow ? { contextWindow: input.contextWindow } : {}),
    maxInputTokens: neuronInputBudget(input.tier, input.providerId),
    maxHistoryMessages: neuronMaxHistory(input.tier),
  });
}
