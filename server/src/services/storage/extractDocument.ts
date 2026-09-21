import { inflateRawSync, inflateSync } from "node:zlib";
import { DOCX_MIME_TYPE } from "@Ken/shared";

const MAX_EXTRACT_CHARS = 100_000;
const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_EOCD = 0x06054b50;

export function isPdfMime(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

export function isDocxMime(mimeType: string): boolean {
  return mimeType === DOCX_MIME_TYPE;
}

export function isExtractableDocumentMime(mimeType: string): boolean {
  return (
    isPdfMime(mimeType) ||
    isDocxMime(mimeType) ||
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    mimeType === "text/csv" ||
    mimeType === "application/json"
  );
}

export function clipExtractedText(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (normalized.length <= MAX_EXTRACT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_EXTRACT_CHARS)}\n\n[Truncated attached file]`;
}

/** Dispatch: plain text, PDF string extraction, or Word document.xml. */
export function extractDocumentText(buffer: Buffer, mimeType: string): string {
  if (mimeType === "text/plain" || mimeType === "text/markdown" || mimeType === "text/csv" || mimeType === "application/json") {
    return clipExtractedText(buffer.toString("utf8"));
  }
  if (isPdfMime(mimeType)) return extractPdfText(buffer);
  if (isDocxMime(mimeType)) return extractDocxText(buffer);
  return "";
}

/**
 * Best-effort PDF text without a PDF library. Inflates FlateDecode streams and
 * collects literal strings; scanned or image-only PDFs yield an empty string.
 */
export function extractPdfText(buffer: Buffer): string {
  const latin = buffer.toString("latin1");
  const chunks: string[] = [];
  const dictStream = /<<([\s\S]*?)>>\s*stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = dictStream.exec(latin))) {
    const dict = match[1] ?? "";
    const start = match.index + match[0].length;
    const lengthMatch = /\/Length\s+(\d+)/.exec(dict);
    let data: Buffer;
    if (lengthMatch) {
      data = buffer.subarray(start, start + Number(lengthMatch[1]));
    } else {
      const end = latin.indexOf("endstream", start);
      if (end < 0) continue;
      data = buffer.subarray(start, end);
      if (data[data.length - 1] === 0x0a) data = data.subarray(0, data.length - 1);
      if (data[data.length - 1] === 0x0d) data = data.subarray(0, data.length - 1);
    }
    if (/\/FlateDecode/.test(dict)) {
      const inflated = inflatePdfStream(data);
      if (inflated) chunks.push(pdfStringsFrom(inflated.toString("latin1")));
    } else {
      chunks.push(pdfStringsFrom(data.toString("latin1")));
    }
  }
  if (chunks.join("").trim().length === 0) {
    chunks.push(pdfStringsFrom(latin));
  }
  return clipExtractedText(chunks.filter(Boolean).join("\n"));
}

export function extractDocxText(buffer: Buffer): string {
  const xml = readZipEntry(buffer, "word/document.xml");
  if (!xml) return "";
  const text = xml
    .toString("utf8")
    .replace(/<w:tab\b[^/]*\/>/g, "\t")
    .replace(/<w:br\b[^/]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  return clipExtractedText(text);
}

function inflatePdfStream(data: Buffer): Buffer | undefined {
  try {
    return inflateSync(data);
  } catch {
    try {
      return inflateRawSync(data);
    } catch {
      return undefined;
    }
  }
}

function pdfStringsFrom(src: string): string {
  const out: string[] = [];
  const lit = /\((?:\\.|[^\\)])*\)/g;
  let match: RegExpExecArray | null;
  while ((match = lit.exec(src))) {
    const decoded = decodePdfLiteral(match[0].slice(1, -1)).trim();
    if (decoded.length >= 2 && /[A-Za-z]/.test(decoded)) out.push(decoded);
  }
  return out.join(" ");
}

function decodePdfLiteral(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{1,3})/g, (_, oct: string) => String.fromCharCode(Number.parseInt(oct, 8)))
    .replace(/\\\r?\n/g, "");
}

function readZipEntry(buffer: Buffer, wanted: string): Buffer | undefined {
  return readZipFromCentralDirectory(buffer, wanted) ?? readZipSequential(buffer, wanted);
}

function readZipFromCentralDirectory(buffer: Buffer, wanted: string): Buffer | undefined {
  if (buffer.length < 22) return undefined;
  let eocd = -1;
  const min = Math.max(0, buffer.length - 22 - 65_535);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === ZIP_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return undefined;
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  const cdSize = buffer.readUInt32LE(eocd + 12);
  const cdEnd = Math.min(buffer.length, cdOffset + cdSize);
  let offset = cdOffset;
  while (offset + 46 <= cdEnd) {
    if (buffer.readUInt32LE(offset) !== ZIP_CENTRAL) break;
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLen).toString("utf8");
    if (name === wanted) {
      return inflateZipPayload(buffer, localOffset, compression, compressedSize);
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return undefined;
}

function readZipSequential(buffer: Buffer, wanted: string): Buffer | undefined {
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== ZIP_LOCAL) break;
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLen).toString("utf8");
    const dataStart = offset + 30 + nameLen + extraLen;
    if (name === wanted && compressedSize > 0 && dataStart + compressedSize <= buffer.length) {
      return inflateZipPayload(buffer, offset, compression, compressedSize);
    }
    if (compressedSize === 0) break;
    offset = dataStart + compressedSize;
  }
  return undefined;
}

function inflateZipPayload(
  buffer: Buffer,
  localOffset: number,
  compression: number,
  compressedSize: number,
): Buffer | undefined {
  if (localOffset + 30 > buffer.length) return undefined;
  const nameLen = buffer.readUInt16LE(localOffset + 26);
  const extraLen = buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + nameLen + extraLen;
  if (dataStart + compressedSize > buffer.length) return undefined;
  const data = buffer.subarray(dataStart, dataStart + compressedSize);
  if (compression === 0) return data;
  if (compression === 8) {
    try {
      return inflateRawSync(data);
    } catch {
      try {
        return inflateSync(data);
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
