import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractDocumentTextIsolated } from "./extractDocumentIsolated.js";
import { foldInlineDocuments } from "../chat/documentParts.js";

const pdf = Buffer.from("%PDF-1.1\nstream\nBT (Isolated document) Tj ET\nendstream", "latin1");
describe("isolated document extraction", { timeout: 15_000 }, () => {
  it("extracts valid documents while rejecting excess concurrent parsers", async () => {
    const first = extractDocumentTextIsolated(pdf, "application/pdf");
    const second = extractDocumentTextIsolated(pdf, "application/pdf");
    await expect(extractDocumentTextIsolated(pdf, "application/pdf")).rejects.toMatchObject({ code: "DOCUMENT_PROCESSOR_BUSY" });
    expect(await first).toContain("Isolated document");
    expect(await second).toContain("Isolated document");
    expect(await extractDocumentTextIsolated(pdf, "application/pdf")).toContain("Isolated document");
  });
  it("propagates the expanded-byte limit from the worker", async () => {
    const bytes = Buffer.concat([Buffer.from("%PDF-1.1\n<< /Filter /FlateDecode >>\nstream\n"),
      deflateSync(Buffer.alloc(5 * 1024 * 1024, 65)), Buffer.from("\nendstream")]);
    await expect(extractDocumentTextIsolated(bytes, "application/pdf")).rejects.toMatchObject({ code: "DOCUMENT_PROCESSING_LIMIT", statusCode: 413 });
    await expect(foldInlineDocuments([{ role: "user", content: "Read this", parts: [{ type: "inline",
      mimeType: "application/pdf", data: bytes.toString("base64"), filename: "large.pdf" }] }]))
      .rejects.toMatchObject({ code: "DOCUMENT_PROCESSING_LIMIT" });
  });
});
