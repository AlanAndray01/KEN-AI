import type { ChatContentPart, ChatMessage } from "../ai/AIProvider.js";
import { isDocxMime, isExtractableDocumentMime, isPdfMime } from "../storage/extractDocument.js";
import { extractDocumentTextIsolated } from "../storage/extractDocumentIsolated.js";
import { AppError } from "../../utils/AppError.js";

/**
 * Turns leftover PDF/DOCX/text parts into message content. Native PDF parts
 * stay as `inline` so Gemini/OpenAI can send them; every other document is
 * unzipped here so AI adapters never import storage.
 */
export async function foldInlineDocuments(
  messages: ChatMessage[],
  options?: { nativeDocuments?: boolean },
): Promise<ChatMessage[]> {
  const nativeDocuments = options?.nativeDocuments === true;
  const result: ChatMessage[] = [];
  for (const message of messages) result.push(await foldOne(message, nativeDocuments));
  return result;
}

async function foldOne(message: ChatMessage, nativeDocuments: boolean): Promise<ChatMessage> {
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
      notes.push(await extractPartNote(part));
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

async function extractPartNote(part: ChatContentPart): Promise<string> {
  const name = part.filename ?? "attachment";
  try {
    const extracted = await extractDocumentTextIsolated(Buffer.from(part.data, "base64"), part.mimeType);
    if (extracted) return `Attached file: ${name}\n${extracted}`;
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Corrupt bytes still must not 400 the turn; the filename note is enough.
  }
  return `[Attached file: ${name}]`;
}
