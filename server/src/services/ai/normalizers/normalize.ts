import type { AIResponse, ChatMessage, StreamEvent } from "../AIProvider.js";

export function compactUsage(usage?: {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
}): AIResponse["usage"] | undefined {
  if (!usage) return undefined;
  const next: NonNullable<AIResponse["usage"]> = {
    ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
    ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
    ...(usage.totalTokens !== undefined ? { totalTokens: usage.totalTokens } : {}),
  };
  return Object.keys(next).length > 0 ? next : undefined;
}

export function normalizeAIResponse(input: {
  content: string;
  model: string;
  provider: string;
  finishReason?: string | null;
  usage?: {
    inputTokens?: number | undefined;
    outputTokens?: number | undefined;
    totalTokens?: number | undefined;
  };
  citations?: unknown[];
  toolCalls?: unknown[];
  metadata?: Record<string, unknown>;
}): AIResponse {
  const finish = input.finishReason?.toLowerCase();
  let finishReason: AIResponse["finishReason"] = "unknown";
  if (finish === "stop" || finish === "end_turn" || finish === "stop_sequence") finishReason = "stop";
  else if (finish === "length" || finish === "max_tokens") finishReason = "length";
  else if (finish === "tool_calls" || finish === "tool_use") finishReason = "tool_calls";
  else if (finish === "error") finishReason = "error";

  const usage = compactUsage(input.usage);

  return {
    content: input.content,
    model: input.model,
    provider: input.provider,
    finishReason,
    ...(usage ? { usage } : {}),
    ...(input.citations ? { citations: input.citations } : {}),
    ...(input.toolCalls ? { toolCalls: input.toolCalls } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

export function toProviderContents(messages: ChatMessage[]): {
  system?: string;
  contents: Array<{
    role: "user" | "model";
    parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
  }>;
} {
  const systemParts: string[] = [];
  const contents: Array<{
    role: "user" | "model";
    parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
  }> = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
      continue;
    }
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    if (message.content) {
      parts.push({ text: message.content });
    }
    for (const part of message.parts ?? []) {
      parts.push({ inlineData: { mimeType: part.mimeType, data: part.data } });
    }
    if (parts.length === 0) {
      parts.push({ text: "" });
    }
    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts,
    });
  }

  return {
    ...(systemParts.length > 0 ? { system: systemParts.join("\n\n") } : {}),
    contents,
  };
}

export function toOpenAIMessages(messages: ChatMessage[]): Array<{ role: string; content: unknown }> {
  return messages.map((message) => {
    const role = message.role === "tool" ? "assistant" : message.role;
    const images = (message.parts ?? []).filter((part) => part.mimeType.startsWith("image/"));
    if (images.length === 0) {
      return { role, content: message.content };
    }
    const content: unknown[] = [];
    if (message.content) {
      content.push({ type: "text", text: message.content });
    }
    for (const part of images) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${part.mimeType};base64,${part.data}` },
      });
    }
    return { role, content };
  });
}

export function toAnthropicMessages(messages: ChatMessage[]): {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: unknown }>;
} {
  const systemParts: string[] = [];
  const mapped: Array<{ role: "user" | "assistant"; content: unknown }> = [];
  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
      continue;
    }
    const role = message.role === "assistant" ? "assistant" : "user";
    const images = (message.parts ?? []).filter((part) => part.mimeType.startsWith("image/"));
    if (images.length === 0) {
      mapped.push({ role, content: message.content });
      continue;
    }
    const content: unknown[] = [];
    if (message.content) {
      content.push({ type: "text", text: message.content });
    }
    for (const part of images) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: part.mimeType, data: part.data },
      });
    }
    mapped.push({ role, content });
  }
  return {
    ...(systemParts.length > 0 ? { system: systemParts.join("\n\n") } : {}),
    messages: mapped,
  };
}

export function chunkEvent(text: string): StreamEvent {
  return { type: "chunk", text };
}
