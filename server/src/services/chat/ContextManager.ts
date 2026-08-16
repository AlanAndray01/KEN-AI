import type { ChatMessage } from "../ai/AIProvider.js";
import { getBuiltInProvider } from "../ai/catalog.js";

const DEFAULT_CONTEXT_WINDOW = 128_000;
const OUTPUT_RESERVE = 2_048;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
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
    const budget = Math.max(32, window - reserve);
    const system = input.messages.filter((message) => message.role === "system");
    const rest = input.messages.filter((message) => message.role !== "system");

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
      kept.push(rest.at(-1)!);
    }

    return [...system, ...kept];
  }
}

function lookupContextWindow(providerId: string, modelId: string): number {
  const model = getBuiltInProvider(providerId)?.models.find((item) => item.id === modelId);
  return model?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
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
