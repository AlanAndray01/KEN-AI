import { describe, expect, it, vi } from "vitest";

const stored = new Map<string, Buffer>();

vi.mock("./index.js", () => ({
  storageService: { get: vi.fn(async (key: string) => stored.get(key) ?? Buffer.alloc(0)) },
}));

const { materializeFilesForModel } = await import("./fileService.js");

/** A minimal PDF whose one content stream holds a literal string. */
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nstream\nBT (Refunds take 14 days) Tj ET\nendstream\nendobj\n%%EOF", "latin1");

describe("materializeFilesForModel", () => {
  it("sends a PDF once, as the file, to a model that reads PDFs", async () => {
    stored.set("pdf", PDF);
    const result = await materializeFilesForModel(
      [{ originalName: "policy.pdf", mimeType: "application/pdf", storageKey: "pdf" }],
      { nativeDocuments: true },
    );

    expect(result.parts).toHaveLength(1);
    expect(result.contentSuffix).toBe("Attached file: policy.pdf (the PDF itself is attached)");
    expect(result.contentSuffix).not.toContain("Refunds");
  });

  it("sends a PDF as text to a model that cannot read the file", async () => {
    stored.set("pdf", PDF);
    const result = await materializeFilesForModel(
      [{ originalName: "policy.pdf", mimeType: "application/pdf", storageKey: "pdf" }],
      { nativeDocuments: false },
    );

    expect(result.parts).toHaveLength(0);
    expect(result.contentSuffix).toContain("Refunds take 14 days");
  });

  it("sends a short document whole", async () => {
    stored.set("short", Buffer.from("Line one.\n\nLine two."));
    const result = await materializeFilesForModel(
      [{ originalName: "notes.txt", mimeType: "text/plain", storageKey: "short" }],
      { question: "anything", charBudget: 12_000 },
    );
    expect(result.contentSuffix).toBe("Attached file: notes.txt\nLine one.\n\nLine two.");
  });

  it("sends only the relevant sections of a document that does not fit", async () => {
    const paragraphs = [
      "Refund policy: refunds are issued within 14 days.",
      ...Array.from({ length: 40 }, (_, index) => `Section ${index} covers office furniture. ${"Filler text. ".repeat(80)}`),
    ];
    stored.set("long", Buffer.from(paragraphs.join("\n\n")));
    const result = await materializeFilesForModel(
      [{ originalName: "handbook.txt", mimeType: "text/plain", storageKey: "long" }],
      { question: "How long do refunds take?", charBudget: 6_000 },
    );

    expect(result.contentSuffix).toMatch(/^Attached file: handbook\.txt \(sections /);
    expect(result.contentSuffix).toContain("refunds are issued within 14 days");
    expect(result.contentSuffix.length).toBeLessThan(7_000);
  });
});
