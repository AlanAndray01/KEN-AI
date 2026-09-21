import { describe, expect, it } from "vitest";
import { attachmentRejection, composerAccept } from "./attachmentGate";

describe("attachmentRejection", () => {
  it("does not block images on a text-only selection — the server routes them", () => {
    expect(
      attachmentRejection({ name: "cat.png", type: "image/png", size: 12 }, ["text", "streaming"]),
    ).toBeNull();
  });

  it("allows images on vision models", () => {
    expect(attachmentRejection({ name: "cat.png", type: "image/png", size: 12 }, ["text", "vision"])).toBeNull();
  });

  it("still rejects oversized files", () => {
    expect(
      attachmentRejection({ name: "huge.png", type: "image/png", size: 20 * 1024 * 1024 }, ["text"]),
    ).toMatch(/too large/i);
  });

  it("explains unsupported types instead of failing silently", () => {
    expect(attachmentRejection({ name: "payload.exe", type: "application/x-msdownload", size: 12 }, ["text"])).toMatch(
      /isn't supported/i,
    );
  });
});

describe("composerAccept", () => {
  it("always offers images, PDFs, and Word documents so a Groq selection can still attach", () => {
    const accept = composerAccept(["text", "streaming"]);
    expect(accept).toContain("image/png");
    expect(accept).toContain("application/pdf");
    expect(accept).toContain(".docx");
  });

  it("offers images on vision models and documents when files or extraction can run", () => {
    const vision = composerAccept(["text", "vision"]);
    expect(vision).toContain("image/png");
    expect(vision).toContain("application/pdf");
    const files = composerAccept(["text", "files"]);
    expect(files).toContain(".docx");
  });
});
