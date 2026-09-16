import { describe, expect, it } from "vitest";
import { attachmentRoutedMessage, displayNameForRoutedModel, quotaFallbackMessage } from "./attachmentRouteToast";

describe("attachmentRoutedMessage", () => {
  it("uses the display name, not the raw catalog id", () => {
    expect(attachmentRoutedMessage("Gemini 3.5 Flash Lite")).toBe("Attachment routed to Gemini 3.5 Flash Lite");
  });
});

describe("quotaFallbackMessage", () => {
  it("names the model that was chosen and the model that answered", () => {
    expect(quotaFallbackMessage("Gemini 3.1 Pro", "Gemini 3.5 Flash Lite")).toBe(
      "Gemini 3.1 Pro has reached its usage limit, so this reply is from Gemini 3.5 Flash Lite.",
    );
  });
});

describe("displayNameForRoutedModel", () => {
  const models = [{ id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite" }];

  it("prefers the name sent on the SSE event", () => {
    expect(displayNameForRoutedModel("gemini-3.5-flash-lite", models, "Gemini 3.5 Flash Lite")).toBe(
      "Gemini 3.5 Flash Lite",
    );
  });

  it("falls back to the picker catalog, then a humanized id", () => {
    expect(displayNameForRoutedModel("gemini-3.5-flash-lite", models)).toBe("Gemini 3.5 Flash Lite");
    expect(displayNameForRoutedModel("gemini-3.1-pro-preview", [])).toBe("Gemini 3.1 Pro Preview");
  });
});
