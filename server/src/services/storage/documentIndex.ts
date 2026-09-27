import { logger } from "../../config/logger.js";
import { File as StoredFile } from "../../models/File.js";
import { toSafeError } from "../../utils/redact.js";
import { splitIntoSections } from "../chat/documentSections.js";
import { extractDocumentText, isExtractableDocumentMime } from "./extractDocument.js";
import { storageService } from "./index.js";

/** Bump when splitIntoSections changes, so stored sections are rebuilt with it. */
export const SECTION_INDEX_VERSION = 1;

export interface IndexableFile {
  _id: { toString(): string };
  mimeType: string;
  storageKey: string;
  textSections?: string[] | null;
  textSectionsVersion?: number | null;
}

/**
 * A document's sections, built on first use and stored on the file.
 *
 * Returns [] for files with no text to search (images, scanned PDFs). A failed
 * write only costs a rebuild next time; the sections are still returned.
 */
export async function documentSectionsFor(file: IndexableFile): Promise<string[]> {
  if (!isExtractableDocumentMime(file.mimeType)) return [];
  if (file.textSectionsVersion === SECTION_INDEX_VERSION && Array.isArray(file.textSections)) {
    return file.textSections;
  }
  const buffer = await storageService.get(file.storageKey);
  const sections = splitIntoSections(extractDocumentText(buffer, file.mimeType));
  try {
    await StoredFile.updateOne(
      { _id: file._id },
      { $set: { textSections: sections, textSectionsVersion: SECTION_INDEX_VERSION } },
    );
  } catch (error) {
    logger.warn({ err: toSafeError(error), fileId: String(file._id) }, "document section index write failed");
  }
  return sections;
}
