import { describe, expect, it } from "vitest";
import { DOCX_MIME_TYPE } from "@Ken/shared";
import { foldInlineDocuments } from "./documentParts.js";

describe("foldInlineDocuments", () => {
  it("extracts PDF bytes into content and drops the part when native documents are off", () => {
    const pdf = Buffer.from(
      `%PDF-1.1
1 0 obj<< /Length 40 >>stream
BT (Hello Ken PDF) Tj ET
endstream
endobj
%%EOF`,
      "latin1",
    );
    const [folded] = foldInlineDocuments(
      [
        {
          role: "user",
          content: "Summarise this",
          parts: [
            {
              type: "inline",
              mimeType: "application/pdf",
              data: pdf.toString("base64"),
              filename: "report.pdf",
            },
          ],
        },
      ],
      { nativeDocuments: false },
    );
    expect(folded?.content).toContain("Summarise this");
    expect(folded?.content).toContain("Hello Ken PDF");
    expect(folded?.parts).toBeUndefined();
  });

  it("keeps native PDF parts for Gemini/OpenAI and still extracts a text note when missing", () => {
    const [folded] = foldInlineDocuments(
      [
        {
          role: "user",
          content: "Summarise this",
          parts: [{ type: "inline", mimeType: "application/pdf", data: "JVBER", filename: "report.pdf" }],
        },
      ],
      { nativeDocuments: true },
    );
    expect(folded?.parts).toEqual([
      { type: "inline", mimeType: "application/pdf", data: "JVBER", filename: "report.pdf" },
    ]);
  });

  it("extracts Word bytes instead of leaving a zip on the message", () => {
    const [folded] = foldInlineDocuments([
      {
        role: "user",
        content: "Summarise this",
        parts: [
          {
            type: "inline",
            mimeType: DOCX_MIME_TYPE,
            data: "AAAA",
            filename: "notes.docx",
          },
        ],
      },
    ]);
    expect(folded?.content).toContain("Summarise this");
    expect(folded?.content).toContain("notes.docx");
    expect(folded?.parts).toBeUndefined();
  });

  it("leaves images as inline parts", () => {
    const [folded] = foldInlineDocuments([
      {
        role: "user",
        content: "What is this?",
        parts: [{ type: "inline", mimeType: "image/png", data: "AAAA" }],
      },
    ]);
    expect(folded?.parts).toEqual([{ type: "inline", mimeType: "image/png", data: "AAAA" }]);
  });
});
