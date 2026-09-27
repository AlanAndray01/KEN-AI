import { estimatePromptTokens } from "@Ken/shared";
import type { ChatMessage } from "../ai/AIProvider.js";
import { getBuiltInProvider } from "../ai/catalog.js";
import { compactCodeHistory } from "./contextCompression.js";

const DEFAULT_CONTEXT_WINDOW = 128_000;
const OUTPUT_RESERVE = 2_048;

/**
 * Sliding window on user/assistant messages. Ten turns is five exchanges —
 * enough to keep the thread, cheap enough that Cloudflare's 10k-neuron day
 * is not spent re-prefilling a novel on every send. The token budget below
 * can still drop older turns sooner.
 */
export const MAX_HISTORY_MESSAGES = 10;

/**
 * Input ceiling per provider, because the binding limit is not the context
 * window — it is whatever the provider meters.
 *
 * Groq's free tier allows 8000 tokens per minute across input and output
 * together (`x-ratelimit-limit-tokens`, refilling continuously), so the old
 * flat 12000 was never actually reachable there: one request that size spends
 * more than a whole minute's allowance and comes back 429. Gemini is metered
 * by requests per day instead and carries a far larger window, so it can hold
 * a real conversation without touching its binding limit.
 *
 * Anything unlisted gets the conservative default.
 */
const PROVIDER_INPUT_TOKENS: Readonly<Record<string, number>> = {
  groq: 6_000,
  cerebras: 6_000,
  gemini: 32_000,
  openai: 24_000,
  openrouter: 16_000,
  deepseek: 16_000,
  // Workers AI free tier is 10,000 neurons/day. A 12k-token prompt on 70B
  // (the unlisted default below) burns that allowance in a handful of turns.
  cloudflare: 4_096,
};

/** Used for a provider with no entry above, and as the ceiling for any of them. */
export const MAX_INPUT_TOKENS = 12_000;

export function providerInputTokens(providerId: string): number {
  return PROVIDER_INPUT_TOKENS[providerId] ?? MAX_INPUT_TOKENS;
}

/**
 * Characters of attached-document text one turn may carry: half the
 * provider's input budget, leaving the rest for the prompt and conversation.
 * Roughly 12k characters on Groq and 64k on Gemini, so a short document is
 * still sent whole and only a long one is narrowed to its relevant sections.
 */
export function documentCharBudget(providerId: string): number {
  return Math.floor(providerInputTokens(providerId) / 2) * 4;
}

const MAX_SYSTEM_TOKENS = 2_400;

/**
 * The rolling summary's own allowance, on top of the fixed system prompt. Capped
 * at a quarter of the turn's budget so on a small window (Workers AI) the
 * summary can never squeeze out the recent messages it exists to complement.
 */
const MAX_SUMMARY_TOKENS = 1_500;

export const estimateTokens = estimatePromptTokens;

export function estimateContextTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + messageCost(message), 0);
}

export class ContextManager {
  build(input: {
    messages: ChatMessage[];
    modelId: string;
    providerId: string;
    contextWindow?: number;
    /** Tighter than the provider meter. Used by the neuron guardrail on lite turns. */
    maxInputTokens?: number;
    maxHistoryMessages?: number;
  }): ChatMessage[] {
    const window = input.contextWindow ?? lookupContextWindow(input.providerId, input.modelId);
    const reserve = Math.min(OUTPUT_RESERVE, Math.max(32, Math.floor(window * 0.1)));
    // Whichever runs out first: what the provider meters, or what the model can
    // physically hold. The old code used one flat number for every provider,
    // which was simultaneously unreachable on Groq and a small fraction of what
    // Gemini offers.
    const budget = Math.min(
      providerInputTokens(input.providerId),
      input.maxInputTokens ?? Number.POSITIVE_INFINITY,
      Math.max(32, window - reserve),
    );
    // Old code blocks are shrunk before the budget is applied, so the space they
    // free is spent keeping more of the conversation rather than dropping it.
    const prepared = compactCodeHistory(stripStaleInlineMedia(input.messages));
    const system = clampSystem(prepared.filter((message) => message.role === "system"), {
      system: MAX_SYSTEM_TOKENS,
      summary: Math.min(MAX_SUMMARY_TOKENS, Math.floor(budget / 4)),
    });
    const rest = prepared
      .filter((message) => message.role !== "system")
      .slice(-(input.maxHistoryMessages ?? MAX_HISTORY_MESSAGES));

    let tokens = system.reduce((sum, message) => sum + messageCost(message), 0);
    const kept: ChatMessage[] = [];

    for (let index = rest.length - 1; index >= 0; index -= 1) {
      const message = rest[index];
      if (!message) continue;
      const cost = messageCost(message);
      if (kept.length > 0 && tokens + cost > budget) {
        // Stop, rather than skip this one and carry on into older messages.
        // Skipping leaves a hole — turn N-1 dropped while N-4 is kept — and
        // hands the model a conversation that contradicts itself. Barely
        // reachable with a six-message window; routine with a longer one.
        break;
      }
      kept.push(message);
      tokens += cost;
    }

    kept.reverse();
    if (kept.length === 0 && rest.length > 0 && rest.at(-1)) {
      kept.push(clampMessage(rest.at(-1)!, Math.max(32, budget - tokens)));
    }

    return ensureEndsWithUserTurn([...system, ...kept]);
  }
}

/**
 * Gemini (native and OpenAI-compat) rejects histories that end on a model
 * turn: "Requests ending with a model turn are not supported". The 6-turn
 * window can land on an assistant reply; drop those trailing replies.
 */
export function ensureEndsWithUserTurn(messages: ChatMessage[]): ChatMessage[] {
  const system = messages.filter((message) => message.role === "system");
  const rest = messages.filter((message) => message.role !== "system");
  while (rest.length > 0 && rest.at(-1)?.role === "assistant") {
    rest.pop();
  }
  return [...system, ...rest];
}

/**
 * Earlier turns' base64 images/PDFs are the silent token bomb: a single Flux
 * JPEG is hundreds of kilobytes, and sending it again on a "thanks" follow-up
 * is billed as tens of thousands of input tokens. Keep inline media only on
 * the current user turn, and only when that turn actually has some.
 */
export function stripStaleInlineMedia(messages: ChatMessage[]): ChatMessage[] {
  let lastUser = -1;
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]?.role === "user") lastUser = index;
  }
  const current = lastUser >= 0 ? messages[lastUser] : undefined;
  const currentNeedsMedia = Boolean(
    current?.parts?.some((part) => part.mimeType.startsWith("image/") || part.mimeType === "application/pdf"),
  );

  return messages.map((message, index) => {
    if (!message.parts?.length) return message;
    if (currentNeedsMedia && index === lastUser) return message;
    const hadImage = message.parts.some((part) => part.mimeType.startsWith("image/"));
    const omitted =
      hadImage && !message.content.includes("omitted") && !message.content.includes("Previously attached")
        ? [message.content, "(Previous image omitted from context.)"].filter(Boolean).join("\n")
        : message.content;
    return { role: message.role, content: omitted };
  });
}

function lookupContextWindow(providerId: string, modelId: string): number {
  const model = getBuiltInProvider(providerId)?.models.find((item) => item.id === modelId);
  return model?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
}

/**
 * Fits the system messages into their budgets without reordering them. The
 * summary draws on its own pool, so a long fixed prompt cannot crowd it out and
 * a long summary cannot crowd out the fixed prompt.
 */
function clampSystem(messages: ChatMessage[], budgets: { system: number; summary: number }): ChatMessage[] {
  const remaining = { ...budgets };
  const result: ChatMessage[] = [];
  for (const message of messages) {
    const pool = message.kind === "summary" ? "summary" : "system";
    if (remaining[pool] <= 0) continue;
    const cost = messageCost(message);
    if (cost <= remaining[pool]) {
      result.push(message);
      remaining[pool] -= cost;
      continue;
    }
    result.push(clampMessage(message, remaining[pool]));
    remaining[pool] = 0;
  }
  return result;
}

function clampMessage(message: ChatMessage, maxTokens: number): ChatMessage {
  const maxChars = Math.max(32, maxTokens * 4);
  if (message.content.length <= maxChars && !message.parts?.length) return message;
  const next: ChatMessage = {
    role: message.role,
    content: message.content.length > maxChars ? `${message.content.slice(0, maxChars)}\n[truncated]` : message.content,
  };
  return next;
}

function messageCost(message: ChatMessage): number {
  let tokens = estimateTokens(message.content) + 4;
  for (const part of message.parts ?? []) {
    if (part.mimeType.startsWith("image/")) {
      tokens += 1024;
    } else {
      tokens += Math.max(1, Math.ceil((part.data.length * 0.75) / 4));
    }
  }
  return tokens;
}

export const contextManager = new ContextManager();
