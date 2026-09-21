import { DOCX_MIME_TYPE } from "@Ken/shared";
import type { AIResponse, ChatContentPart, ChatMessage, StreamEvent } from "../AIProvider.js";

function isPdfMime(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

function isDocxMime(mimeType: string): boolean {
  return mimeType === DOCX_MIME_TYPE;
}

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
      if (part.mimeType.startsWith("image/") || isPdfMime(part.mimeType)) {
        parts.push({ inlineData: { mimeType: part.mimeType, data: part.data } });
        continue;
      }
      const note = leftoverDocumentNote(part, message.content);
      if (note) parts.push({ text: note });
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
   * accepts those; Groq, Cerebras, DeepSeek, Cloudflare, and Gemini's compat
   * endpoint 400 on an unknown content type. Document bytes are unzipped in
   * chat `foldInlineDocuments`, not here.
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
    const nativeDocs = options.documents === true ? parts.filter((part) => isPdfMime(part.mimeType)) : [];
    const leftoverNotes = parts
      .filter(
        (part) =>
          (isPdfMime(part.mimeType) && options.documents !== true) || isDocxMime(part.mimeType),
      )
      .map((part) => leftoverDocumentNote(part, message.content))
      .filter(Boolean)
      .join("\n\n");
    const text = [message.content, leftoverNotes].filter(Boolean).join("\n\n");
    if (images.length === 0 && nativeDocs.length === 0) {
      return { role, content: text };
    }
    const content: unknown[] = [];
    if (text) {
      content.push({ type: "text", text });
    }
    for (const part of images) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${part.mimeType};base64,${part.data}` },
      });
    }
    for (const part of nativeDocs) {
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

/** Filename-only fallback. Unzipping lives in `foldInlineDocuments`. */
function leftoverDocumentNote(part: ChatContentPart, existingContent: string): string {
  if (!isPdfMime(part.mimeType) && !isDocxMime(part.mimeType)) return "";
  if (!part.filename) return "";
  if (existingContent.includes(part.filename)) return "";
  return `[Attached file: ${part.filename}]`;
}

export function chunkEvent(text: string): StreamEvent {
  return { type: "chunk", text };
}
