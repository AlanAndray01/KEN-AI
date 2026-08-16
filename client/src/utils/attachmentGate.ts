import type { ModelCapability } from "@aether/shared";
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES } from "@aether/shared";

export function attachmentRejection(
  file: { name: string; type: string; size: number },
  capabilities: ModelCapability[],
): string | null {
  const mime = file.type === "image/jpg" ? "image/jpeg" : file.type;
  const vision = capabilities.includes("vision");
  const files = capabilities.includes("files");
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf";

  if (file.size > MAX_UPLOAD_BYTES) {
    return "File is too large";
  }
  if (isImage && !vision) {
    return "This model cannot analyze images. Choose a vision-capable model.";
  }
  if (isPdf && !files && !vision) {
    return "This model cannot read files. Choose a file-capable model.";
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

export function composerAccept(capabilities: ModelCapability[]): string {
  const vision = capabilities.includes("vision");
  const files = capabilities.includes("files");
  const types = ["text/plain", "text/markdown", "text/csv", "application/json", ".txt", ".md", ".csv", ".json"];
  if (vision) {
    types.push("image/png", "image/jpeg", "image/webp", "image/gif");
  }
  if (files || vision) {
    types.push("application/pdf");
  }
  return types.join(",");
}
