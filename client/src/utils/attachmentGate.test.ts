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
});

describe("composerAccept", () => {
  it("always offers images and PDFs so a Groq selection can still attach", () => {
    const accept = composerAccept(["text", "streaming"]);
    expect(accept).toContain("image/png");
    expect(accept).toContain("application/pdf");
  });
});
