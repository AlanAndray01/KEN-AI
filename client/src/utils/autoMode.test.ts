import { describe, expect, it } from "vitest";
import type { PublicAIModel } from "@Ken/shared";
import { availableCapabilities, modelFooterCaption } from "./autoMode";

function model(partial: Partial<PublicAIModel> & Pick<PublicAIModel, "id" | "providerId">): PublicAIModel {
  return { name: partial.id, capabilities: ["text"], enabled: true, available: true, ...partial };
}

describe("availableCapabilities", () => {
  it("offers anything at least one available model can do", () => {
    const text = model({ id: "qwen", providerId: "groq", capabilities: ["text", "streaming"] });
    const vision = model({ id: "lite", providerId: "gemini", capabilities: ["text", "vision"] });
    expect(availableCapabilities([text, vision]).sort()).toEqual(["streaming", "text", "vision"]);
  });

  it("ignores models that are unavailable or disabled", () => {
    const offline = model({ id: "gpt-4.1", providerId: "openai", capabilities: ["files"], available: false });
    const disabled = model({ id: "gpt-4o-mini", providerId: "openai", capabilities: ["tools"], enabled: false });
    expect(availableCapabilities([offline, disabled])).toEqual([]);
  });
});

describe("modelFooterCaption", () => {
  const models = [{ id: "gpt-4.1", name: "GPT-4.1" }];

  it("names the model Auto chose", () => {
    expect(modelFooterCaption({ model: "gpt-4.1", autoTask: "code" }, models)).toBe(
      "Auto · GPT-4.1",
    );
  });

  it("shows the plain model name for a manual pick", () => {
    expect(modelFooterCaption({ model: "gpt-4.1" }, models)).toBe("GPT-4.1");
  });

  it("shows Auto while the server has not named a model yet", () => {
    expect(modelFooterCaption({ model: "auto" }, models)).toBe("Auto");
  });

  it("falls back to the raw id for an unlisted model", () => {
    expect(modelFooterCaption({ model: "gpt-4o-mini", autoTask: "reasoning" }, models)).toBe("Auto · gpt-4o-mini");
  });
});
