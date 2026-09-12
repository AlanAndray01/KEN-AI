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

  while (contents.length > 0 && contents.at(-1)?.role === "model") {
    contents.pop();
  }

  return {
    ...(systemParts.length > 0 ? { system: systemParts.join("\n\n") } : {}),
    contents,
  };
}

export interface OpenAIMessageOptions {
  /**
   * Emit PDF parts as `type: "file"` blocks. Only OpenAI's own chat/completions
   * accepts those; the other OpenAI-compatible surfaces Ken talks to (Groq,
   * Cerebras, DeepSeek, Cloudflare, Gemini's compat endpoint) reject an unknown
   * content block with a 400, so this stays off unless the adapter opts in.
   */
  documents?: boolean;
}

export function toOpenAIMessages(
  messages: ChatMessage[],
  options: OpenAIMessageOptions = {},
): Array<{ role: string; content: unknown }> {
  const mapped = messages.map((message) => {
    const role = message.role === "tool" ? "assistant" : message.role;
    const parts = message.parts ?? [];
    const images = parts.filter((part) => part.mimeType.startsWith("image/"));
    const documents = options.documents === true ? parts.filter((part) => isDocumentPart(part.mimeType)) : [];
    if (images.length === 0 && documents.length === 0) {
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
    for (const part of documents) {
      content.push({
        type: "file",
        file: {
          filename: part.filename ?? "attachment.pdf",
          file_data: `data:${part.mimeType};base64,${part.data}`,
        },
      });
    }
    return { role, content };
  });
  while (mapped.length > 0 && mapped.at(-1)?.role === "assistant") {
    mapped.pop();
  }
  return mapped;
}

/** PDF is the only non-image attachment Ken forwards as binary; text is inlined upstream. */
function isDocumentPart(mimeType: string): boolean {
  return mimeType === "application/pdf";
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
    const parts = message.parts ?? [];
    const images = parts.filter((part) => part.mimeType.startsWith("image/"));
    const documents = parts.filter((part) => isDocumentPart(part.mimeType));
    if (images.length === 0 && documents.length === 0) {
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
    for (const part of documents) {
      // Anthropic reads PDFs natively through a document block.
      content.push({
        type: "document",
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
