import { describe, expect, it } from "vitest";
import { AppError } from "../../utils/AppError.js";
import { validateUploadBuffer } from "./validateUpload.js";
import { assertAttachmentsAllowed } from "./fileService.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("validateUploadBuffer", () => {
  it("accepts a PNG image", () => {
    const result = validateUploadBuffer({
      originalName: "photo.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    expect(result.kind).toBe("image");
    expect(result.mimeType).toBe("image/png");
  });

  it("rejects executables", () => {
    expect(() =>
      validateUploadBuffer({
        originalName: "payload.exe",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("MZ"),
      }),
    ).toThrow(AppError);
  });

  it("accepts UTF-8 text documents", () => {
    const result = validateUploadBuffer({
      originalName: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello from Ken"),
    });
    expect(result.kind).toBe("document");
  });
});

describe("assertAttachmentsAllowed", () => {
  it("blocks images when the model lacks vision", () => {
    expect(() =>
      assertAttachmentsAllowed(["text", "streaming"], [{ mimeType: "image/png", originalName: "a.png" }]),
    ).toThrow(/cannot analyze images/i);
  });

  it("blocks PDFs when the model cannot read files", () => {
    expect(() =>
      assertAttachmentsAllowed(["text", "streaming"], [{ mimeType: "application/pdf", originalName: "a.pdf" }]),
    ).toThrow(/cannot read files/i);
  });

  it("allows images on vision-capable models", () => {
    expect(() =>
      assertAttachmentsAllowed(["text", "vision", "streaming"], [{ mimeType: "image/png", originalName: "a.png" }]),
    ).not.toThrow();
  });
});
