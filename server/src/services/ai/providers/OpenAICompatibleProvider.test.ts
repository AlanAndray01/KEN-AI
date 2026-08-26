import { describe, expect, it } from "vitest";
import { parseProviderHttpError } from "./OpenAICompatibleProvider.js";

describe("parseProviderHttpError", () => {
  it("maps Groq decommissioned models to MODEL_UNAVAILABLE", () => {
    const error = parseProviderHttpError(
      400,
      JSON.stringify({
        error: {
          message: "The model `llama-3.3-70b-versatile` has been decommissioned.",
          code: "model_decommissioned",
        },
      }),
      "groq",
    );
    expect(error).toMatchObject({ code: "MODEL_UNAVAILABLE", statusCode: 404 });
    expect(error.message).toContain("decommissioned");
  });

  it("maps 429 to PROVIDER_RATE_LIMITED", () => {
    const error = parseProviderHttpError(429, "{}", "groq");
    expect(error).toMatchObject({ code: "PROVIDER_RATE_LIMITED", statusCode: 429 });
  });

  it("surfaces Groq's error message on other failures", () => {
    const error = parseProviderHttpError(
      500,
      JSON.stringify({ error: { message: "Internal server error from Groq" } }),
      "groq",
    );
    expect(error).toMatchObject({ code: "PROVIDER_ERROR", statusCode: 502 });
    expect(error.message).toBe("Internal server error from Groq");
  });
});
