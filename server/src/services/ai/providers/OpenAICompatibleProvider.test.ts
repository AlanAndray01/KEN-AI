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

  it("captures Google's 429 quota class and retry-in hint", () => {
    const error = parseProviderHttpError(
      429,
      JSON.stringify({
        error: {
          code: 429,
          message:
            "You exceeded your current quota, please check your plan and billing details.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.8-flash\nPlease retry in 49.390613815s.",
          status: "RESOURCE_EXHAUSTED",
        },
      }),
      "gemini",
    );
    expect(error).toMatchObject({ code: "PROVIDER_RATE_LIMITED", statusCode: 429 });
    expect(error.extra).toMatchObject({
      httpStatus: 429,
      errorClass: "quota_exceeded",
      retryAfterMs: 49391,
    });
  });

  it("maps 503 to PROVIDER_UNAVAILABLE so the hop is logged as a hang, not a 404", () => {
    const error = parseProviderHttpError(503, JSON.stringify({ error: { message: "The service is currently unavailable." } }), "gemini");
    expect(error).toMatchObject({ code: "PROVIDER_UNAVAILABLE", statusCode: 503 });
  });

  it("maps Google's retired Gemini 404 (array-wrapped) to MODEL_UNAVAILABLE", () => {
    const error = parseProviderHttpError(
      404,
      JSON.stringify([
        {
          error: {
            code: 404,
            message:
              "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.6-flash",
            status: "NOT_FOUND",
          },
        },
      ]),
      "gemini",
    );
    expect(error).toMatchObject({ code: "MODEL_UNAVAILABLE", statusCode: 404 });
    expect(error.message).toContain("no longer available");
  });

  it("maps an empty 404 to MODEL_UNAVAILABLE so Ken does not hop providers", () => {
    const error = parseProviderHttpError(404, "", "gemini");
    expect(error).toMatchObject({ code: "MODEL_UNAVAILABLE", statusCode: 404 });
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
