import { estimatePromptTokens } from "@aether/shared";
import type { ChatMessage } from "../ai/AIProvider.js";
import { getBuiltInProvider } from "../ai/catalog.js";

const DEFAULT_CONTEXT_WINDOW = 128_000;
const OUTPUT_RESERVE = 2_048;
/** Last N user/assistant messages kept for fast prefill. */
export const MAX_HISTORY_MESSAGES = 6;
/** Soft cap so Groq/Gemini prefill stays small. */
export const MAX_INPUT_TOKENS = 12_000;
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
    const budget = Math.min(MAX_INPUT_TOKENS, Math.max(32, window - reserve));
    const system = clampSystem(input.messages.filter((message) => message.role === "system"), MAX_SYSTEM_TOKENS);
    const rest = input.messages.filter((message) => message.role !== "system").slice(-MAX_HISTORY_MESSAGES);

    let tokens = system.reduce((sum, message) => sum + messageCost(message), 0);
    const kept: ChatMessage[] = [];

    for (let index = rest.length - 1; index >= 0; index -= 1) {
      const message = rest[index];
      if (!message) continue;
      const cost = messageCost(message);
      if (kept.length > 0 && tokens + cost > budget) {
        continue;
      }
      kept.push(message);
      tokens += cost;
    }

    kept.reverse();
    if (kept.length === 0 && rest.length > 0 && rest.at(-1)) {
      kept.push(clampMessage(rest.at(-1)!, Math.max(32, budget - tokens)));
    }

    return [...system, ...kept];
  }
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
