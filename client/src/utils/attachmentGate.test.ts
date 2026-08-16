import { describe, expect, it } from "vitest";
import { attachmentRejection } from "./attachmentGate";

describe("attachmentRejection", () => {
  it("explains when images are not supported", () => {
    expect(
      attachmentRejection({ name: "cat.png", type: "image/png", size: 12 }, ["text", "streaming"]),
    ).toMatch(/cannot analyze images/i);
  });

  it("allows images on vision models", () => {
    expect(attachmentRejection({ name: "cat.png", type: "image/png", size: 12 }, ["text", "vision"])).toBeNull();
  });
});
