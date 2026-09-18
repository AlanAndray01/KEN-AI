import { estimatePromptTokens } from "@Ken/shared";
import type { ChatMessage } from "../ai/AIProvider.js";
import { getBuiltInProvider } from "../ai/catalog.js";

const DEFAULT_CONTEXT_WINDOW = 128_000;
const OUTPUT_RESERVE = 2_048;

/**
 * Ceiling on how many user/assistant messages may be considered at all.
 *
 * Raised from 6. Six messages is three exchanges, so a thread lost its own
 * thread after three turns however much room the model had — which is what
 * "the context limit drops very soon" actually was. This is now only an upper
 * bound; the token budget below is what really decides, and it drops the
 * oldest messages first when a thread is genuinely long.
 */
export const MAX_HISTORY_MESSAGES = 24;

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
};

/** Used for a provider with no entry above, and as the ceiling for any of them. */
export const MAX_INPUT_TOKENS = 12_000;

export function providerInputTokens(providerId: string): number {
  return PROVIDER_INPUT_TOKENS[providerId] ?? MAX_INPUT_TOKENS;
}

const MAX_SYSTEM_TOKENS = 2_400;

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
  }): ChatMessage[] {
    const window = input.contextWindow ?? lookupContextWindow(input.providerId, input.modelId);
    const reserve = Math.min(OUTPUT_RESERVE, Math.max(32, Math.floor(window * 0.1)));
    // Whichever runs out first: what the provider meters, or what the model can
    // physically hold. The old code used one flat number for every provider,
    // which was simultaneously unreachable on Groq and a small fraction of what
    // Gemini offers.
    const budget = Math.min(providerInputTokens(input.providerId), Math.max(32, window - reserve));
    const system = clampSystem(input.messages.filter((message) => message.role === "system"), MAX_SYSTEM_TOKENS);
    const rest = input.messages.filter((message) => message.role !== "system").slice(-MAX_HISTORY_MESSAGES);

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

function lookupContextWindow(providerId: string, modelId: string): number {
  const model = getBuiltInProvider(providerId)?.models.find((item) => item.id === modelId);
  return model?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
}

function clampSystem(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
  let remaining = maxTokens;
  const result: ChatMessage[] = [];
  for (const message of messages) {
    if (remaining <= 0) break;
    const cost = messageCost(message);
    if (cost <= remaining) {
      result.push(message);
      remaining -= cost;
      continue;
    }
    result.push(clampMessage(message, remaining));
    break;
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
