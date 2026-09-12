import type { ModelCapability } from "@Ken/shared";
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES } from "@Ken/shared";

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
    const allowedExt = ["png", "jpg", "jpeg", "webp", "gif", "pdf", "txt", "md", "csv", "json"];
    if (!extension || !allowedExt.includes(extension)) {
      return "File type is not allowed";
    }
  }
  return null;
}

/** Images and PDFs are always offered; the server routes to a capable model. */
export function composerAccept(_capabilities?: ModelCapability[]): string {
  return [
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    ".txt",
    ".md",
    ".csv",
    ".json",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/pdf",
  ].join(",");
}
