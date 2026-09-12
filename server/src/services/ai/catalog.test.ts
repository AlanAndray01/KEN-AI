import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEMINI_MODEL_ID,
  GEMINI_FLASH_2_MODEL_ID,
  GEMINI_FLASH_MODEL_ID,
  GEMINI_PRO_MODEL_ID,
} from "@Ken/shared";
import { getBuiltInProvider } from "./catalog.js";

describe("Gemini catalog", () => {
  it("lists official AI Studio chat models with vision and files", () => {
    const gemini = getBuiltInProvider("gemini");
    expect(gemini).toBeDefined();
    const ids = gemini!.models.map((model) => model.id);
    expect(ids).toEqual([
      DEFAULT_GEMINI_MODEL_ID,
      GEMINI_FLASH_MODEL_ID,
      GEMINI_FLASH_2_MODEL_ID,
      GEMINI_PRO_MODEL_ID,
    ]);
    expect(ids).not.toContain("gemini-1.5-flash");
    expect(ids).not.toContain("gemini-1.5-pro");
    expect(ids).not.toContain("gemini-3.1-flash-image");
    for (const model of gemini!.models) {
      expect(model.capabilities).toEqual(expect.arrayContaining(["vision", "files", "text", "streaming"]));
      expect(model.contextWindow).toBe(1_000_000);
    }
  });
});
