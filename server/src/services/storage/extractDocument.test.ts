import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { DOCX_MIME_TYPE } from "@Ken/shared";
import { extractDocxText, extractDocumentText, extractPdfText } from "./extractDocument.js";

describe("extractPdfText", () => {
  it("reads literal strings from an uncompressed content stream", () => {
    const pdf = Buffer.from(
      `%PDF-1.1
1 0 obj<< /Length 44 >>stream
BT /F1 12 Tf (Hello Ken PDF) Tj ET
endstream
endobj
%%EOF`,
      "latin1",
    );
    expect(extractPdfText(pdf)).toContain("Hello Ken PDF");
  });

  it("inflates a FlateDecode stream", () => {
    const inner = Buffer.from("BT (Inflated Ken PDF) Tj ET", "latin1");
    const compressed = deflateRawSync(inner);
    const pdf = Buffer.concat([
      Buffer.from(`%PDF-1.1\n1 0 obj<< /Length ${compressed.length} /Filter /FlateDecode >>stream\n`, "latin1"),
      compressed,
      Buffer.from("\nendstream\nendobj\n%%EOF", "latin1"),
    ]);
    expect(extractPdfText(pdf)).toContain("Inflated Ken PDF");
  });
});

describe("extractDocxText", () => {
  it("reads w:t runs from word/document.xml inside a stored zip", () => {
    const xml =
      '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Hello from Word</w:t></w:r></w:p></w:body></w:document>';
    const zip = storedZip([{ name: "word/document.xml", data: Buffer.from(xml, "utf8") }]);
    expect(extractDocxText(zip)).toContain("Hello from Word");
    expect(extractDocumentText(zip, DOCX_MIME_TYPE)).toContain("Hello from Word");
  });
});

function storedZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localFull = Buffer.concat([local, name, entry.data]);
    locals.push(localFull);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    offset += localFull.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, eocd]);
}
