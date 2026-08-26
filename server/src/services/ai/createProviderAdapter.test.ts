import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../utils/AppError.js";
import { createProviderAdapter } from "./createProviderAdapter.js";

vi.mock("./providers/MockProvider.js", () => ({
  isMockAiAllowed: () => false,
  MockProvider: class MockProvider {},
}));

describe("createProviderAdapter", () => {
  it("refuses leftover Gemini provider configs", () => {
    expect(() =>
      createProviderAdapter({
        id: "gemini",
        name: "Google Gemini",
        type: "gemini",
        credentials: {},
      }),
    ).toThrow(AppError);
    try {
      createProviderAdapter({
        id: "gemini",
        name: "Google Gemini",
        type: "gemini",
        credentials: {},
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "PROVIDER_REMOVED" });
    }
  });
});
