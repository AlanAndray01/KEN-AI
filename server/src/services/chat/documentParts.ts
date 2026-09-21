import type { ChatContentPart, ChatMessage } from "../ai/AIProvider.js";
import { extractDocumentText, isDocxMime, isExtractableDocumentMime, isPdfMime } from "../storage/extractDocument.js";

/**
 * Turns leftover PDF/DOCX/text parts into message content. Native PDF parts
 * stay as `inline` so Gemini/OpenAI can send them; every other document is
 * unzipped here so AI adapters never import storage.
 */
export function foldInlineDocuments(
  messages: ChatMessage[],
  options?: { nativeDocuments?: boolean },
): ChatMessage[] {
  const nativeDocuments = options?.nativeDocuments === true;
  return messages.map((message) => foldOne(message, nativeDocuments));
}

function foldOne(message: ChatMessage, nativeDocuments: boolean): ChatMessage {
  const parts = message.parts ?? [];
  if (parts.length === 0) return message;
  const notes: string[] = [];
  const kept: ChatContentPart[] = [];
  for (const part of parts) {
    if (part.mimeType.startsWith("image/")) {
      kept.push(part);
      continue;
    }
    if (isPdfMime(part.mimeType) && nativeDocuments) {
      kept.push(part);
      continue;
    }
    if (isExtractableDocumentMime(part.mimeType) || isDocxMime(part.mimeType)) {
      notes.push(extractPartNote(part));
      continue;
    }
    kept.push(part);
  }
  const extra = notes.filter((note) => note && !message.content.includes(note));
  if (extra.length === 0 && kept.length === parts.length) return message;
  const { parts: _dropped, ...rest } = message;
  return {
    ...rest,
    content: [message.content, ...extra].filter(Boolean).join("\n\n"),
    ...(kept.length > 0 ? { parts: kept } : {}),
  };
}

function extractPartNote(part: ChatContentPart): string {
  const name = part.filename ?? "attachment";
  try {
    const extracted = extractDocumentText(Buffer.from(part.data, "base64"), part.mimeType);
    if (extracted) return `Attached file: ${name}\n${extracted}`;
  } catch {
    // Corrupt bytes still must not 400 the turn; the filename note is enough.
  }
  return `[Attached file: ${name}]`;
}
