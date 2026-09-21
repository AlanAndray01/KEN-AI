import type { ModelCapability } from "@Ken/shared";
import { ALLOWED_UPLOAD_MIME_TYPES, DOCX_MIME_TYPE, MAX_UPLOAD_BYTES } from "@Ken/shared";

const IMAGE_ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const DOCUMENT_ACCEPT = [
  "application/pdf",
  DOCX_MIME_TYPE,
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".csv",
  ".json",
];

const ALLOWED_EXT = ["png", "jpg", "jpeg", "webp", "gif", "pdf", "docx", "txt", "md", "csv", "json"];

export const UNSUPPORTED_ATTACHMENT_MESSAGE =
  "This file type isn't supported. Attach an image, PDF, Word document (.docx), or a text file (.txt, .md, .csv, .json).";

export function attachmentRejection(
  file: { name: string; type: string; size: number },
  _capabilities?: ModelCapability[],
): string | null {
  const mime = file.type === "image/jpg" ? "image/jpeg" : file.type;
  const isImage = mime.startsWith("image/");

  if (file.size > MAX_UPLOAD_BYTES) {
    return "File is too large";
  }
  if (mime && !(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(mime) && !isImage) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !ALLOWED_EXT.includes(extension)) {
      return UNSUPPORTED_ATTACHMENT_MESSAGE;
    }
  }
  return null;
}

/**
 * Images for vision models (and text models the server can hop). Documents for
 * native `files` models and everyone else, because the API extracts PDF/DOCX
 * text when the vendor cannot take a raw document block.
 */
export function composerAccept(capabilities?: ModelCapability[]): string {
  const caps = capabilities ?? [];
  const imageOnly = caps.includes("imageGeneration") && !caps.includes("text") && !caps.includes("vision");
  if (imageOnly) return IMAGE_ACCEPT.join(",");

  const allowImages = caps.length === 0 || caps.includes("vision") || caps.includes("text");
  const allowDocuments =
    caps.length === 0 || caps.includes("files") || caps.includes("text") || caps.includes("vision");
  const parts: string[] = [];
  if (allowImages) parts.push(...IMAGE_ACCEPT);
  if (allowDocuments) parts.push(...DOCUMENT_ACCEPT);
  return parts.join(",");
}
