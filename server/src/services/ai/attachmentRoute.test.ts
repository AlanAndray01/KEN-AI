import { describe, expect, it } from "vitest";
import {
  attachmentNeed,
  attachmentNeedFromMessages,
  modelSatisfiesAttachmentNeed,
  pickMultimodalRoute,
} from "./attachmentRoute.js";

function model(partial: {
  id: string;
  providerId: string;
  capabilities: Array<"text" | "vision" | "files" | "streaming">;
  available?: boolean;
}) {
  return {
    name: partial.id,
    enabled: true,
    available: partial.available ?? true,
    ...partial,
  };
}

const groq = model({
  id: "qwen/qwen3.6-27b",
  providerId: "groq",
  capabilities: ["text", "streaming"],
});
const lite = model({
  id: "gemini-3.5-flash-lite",
  providerId: "gemini",
  capabilities: ["text", "vision", "files", "streaming"],
});
const flash = model({
  id: "gemini-3.8-flash",
  providerId: "gemini",
  capabilities: ["text", "vision", "files", "streaming"],
});

describe("attachmentNeed", () => {
  it("treats text-only attachments as no special capability", () => {
    expect(attachmentNeed([{ mimeType: "text/plain" }])).toBe("none");
  });

  it("requires vision for images and files for PDFs", () => {
    expect(attachmentNeed([{ mimeType: "image/png" }])).toBe("vision");
    expect(attachmentNeed([{ mimeType: "application/pdf" }])).toBe("files");
    expect(attachmentNeed([{ mimeType: "image/png" }, { mimeType: "application/pdf" }])).toBe("files");
  });

  it("reads the same need from chat message parts", () => {
    expect(
      attachmentNeedFromMessages([
        { role: "user", content: "look", parts: [{ type: "inline", mimeType: "image/jpeg", data: "AA" }] },
      ]),
    ).toBe("vision");
  });
});

describe("pickMultimodalRoute", () => {
  it("keeps a Gemini selection that already has vision and files", () => {
    expect(pickMultimodalRoute([lite, groq], { providerId: "gemini", modelId: lite.id }, "files")).toEqual({
      providerId: "gemini",
      modelId: lite.id,
      rerouted: false,
    });
  });

  it("routes a Groq image turn onto Gemini Flash Lite", () => {
    expect(pickMultimodalRoute([groq, flash, lite], { providerId: "groq", modelId: groq.id }, "vision")).toEqual({
      providerId: "gemini",
      modelId: lite.id,
      rerouted: true,
      reason: "ATTACHMENT_ROUTE|vision",
    });
  });

  it("routes a Groq PDF turn onto a files-capable model", () => {
    const route = pickMultimodalRoute([groq, lite], { providerId: "groq", modelId: groq.id }, "files");
    expect(route).toMatchObject({ providerId: "gemini", modelId: lite.id, rerouted: true });
    expect(modelSatisfiesAttachmentNeed(lite.capabilities, "files")).toBe(true);
    expect(modelSatisfiesAttachmentNeed(groq.capabilities, "files")).toBe(false);
  });

  it("returns undefined when nothing configured can read the payload", () => {
    expect(pickMultimodalRoute([groq], { providerId: "groq", modelId: groq.id }, "vision")).toBeUndefined();
  });

  it("ignores an unavailable Gemini hop", () => {
    expect(
      pickMultimodalRoute(
        [groq, { ...lite, available: false }],
        { providerId: "groq", modelId: groq.id },
        "vision",
      ),
    ).toBeUndefined();
  });
});
