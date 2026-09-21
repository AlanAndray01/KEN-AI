import { describe, expect, it } from "vitest";
import { detectImageRequest, ensureImageGenerationTool, withImageGenerationTool } from "./imageIntent.js";

describe("detectImageRequest", () => {
  it("catches the plain creation requests", () => {
    expect(detectImageRequest("draw a cat")).toBe(true);
    expect(detectImageRequest("generate an image of a sunset")).toBe(true);
    expect(detectImageRequest("Can you make me a logo for my coffee shop?")).toBe(true);
    expect(detectImageRequest("paint a landscape in watercolour")).toBe(true);
    expect(detectImageRequest("I need a picture of a robot")).toBe(true);
    expect(detectImageRequest("render a 3d illustration of a bicycle")).toBe(true);
    expect(
      detectImageRequest("Hey so can you make me an image of 3d realistic cube with snow in the background"),
    ).toBe(true);
  });

  it("leaves questions about an existing image to the vision route", () => {
    // These arrive with an attachment; answering them with a freshly generated
    // picture would replace the user's question with a different one.
    expect(detectImageRequest("what is in this image?")).toBe(false);
    expect(detectImageRequest("describe this picture in detail")).toBe(false);
    expect(detectImageRequest("read the text in the attached screenshot")).toBe(false);
    expect(detectImageRequest("explain that diagram")).toBe(false);
  });

  it("does not fire on non-visual uses of the same verbs", () => {
    // Every one of these contains a creation verb, and none wants a picture.
    expect(detectImageRequest("create a table of the results")).toBe(false);
    expect(detectImageRequest("make a list of dependencies")).toBe(false);
    expect(detectImageRequest("generate a secure password")).toBe(false);
    expect(detectImageRequest("draw a conclusion from the data")).toBe(false);
    expect(detectImageRequest("design a database schema for users")).toBe(false);
    expect(detectImageRequest("write a React component that renders a chart")).toBe(false);
  });

  it("ignores empty and whitespace input", () => {
    expect(detectImageRequest("")).toBe(false);
    expect(detectImageRequest("   \n ")).toBe(false);
  });
});

describe("withImageGenerationTool", () => {
  it("adds image_generation when the text is a creation request", () => {
    expect(withImageGenerationTool("draw a cat")).toEqual(["image_generation"]);
    expect(withImageGenerationTool("draw a cat", ["web_search"])).toEqual(["web_search", "image_generation"]);
  });

  it("does not add the tool for ordinary chat", () => {
    expect(withImageGenerationTool("hello")).toBeUndefined();
    expect(withImageGenerationTool("hello", ["web_search"])).toEqual(["web_search"]);
  });
});

describe("ensureImageGenerationTool", () => {
  it("adds image_generation even when the text is not a creation request", () => {
    expect(ensureImageGenerationTool()).toEqual(["image_generation"]);
    expect(ensureImageGenerationTool(["web_search"])).toEqual(["web_search", "image_generation"]);
    expect(ensureImageGenerationTool(["image_generation"])).toEqual(["image_generation"]);
  });
});
