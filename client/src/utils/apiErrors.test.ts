import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/services/api";
import { categorizeApiError, describeApiError, describeGenerationError, logApiError } from "./apiErrors";

function apiError(status: number, message: string, code = "SOME_CODE"): ApiError {
  return new ApiError(message, { status, code, requestId: "req-1" });
}

describe("categorizeApiError", () => {
  it("maps HTTP statuses to categories", () => {
    expect(categorizeApiError(apiError(401, "x"))).toBe("authentication");
    expect(categorizeApiError(apiError(403, "x"))).toBe("authorization");
    expect(categorizeApiError(apiError(404, "x"))).toBe("notFound");
    expect(categorizeApiError(apiError(429, "x"))).toBe("rateLimited");
    expect(categorizeApiError(apiError(400, "x"))).toBe("validation");
    expect(categorizeApiError(apiError(500, "x"))).toBe("server");
  });

  it("treats a rejected fetch as a network problem", () => {
    expect(categorizeApiError(new TypeError("Failed to fetch"))).toBe("network");
  });
});

describe("describeApiError", () => {
  it("tells the user their session ended rather than showing a generic failure", () => {
    expect(describeApiError(apiError(401, "Authentication required"), "fallback")).toContain("session expired");
  });

  it("does not treat a vendor 401 as a Ken session expiry", () => {
    expect(
      categorizeApiError(apiError(502, "That model could not authenticate the request.", "PROVIDER_INVALID_CREDENTIALS")),
    ).toBe("server");
    expect(
      describeApiError(
        apiError(502, "That model could not authenticate the request.", "PROVIDER_INVALID_CREDENTIALS"),
        "fallback",
      ),
    ).toContain("could not be reached");
    expect(
      describeApiError(
        apiError(502, "That model could not authenticate the request.", "PROVIDER_INVALID_CREDENTIALS"),
        "fallback",
      ),
    ).not.toMatch(/session expired|Invalid credentials/i);
  });

  it("keeps the specific server message for validation errors", () => {
    expect(describeApiError(apiError(400, "Invalid request"), "fallback")).toBe("Invalid request");
  });

  it("keeps the Gemini quota message instead of a generic app rate-limit toast", () => {
    expect(
      describeApiError(
        apiError(429, "Gemini quota reached. One chat message is one Google request.", "PROVIDER_RATE_LIMITED"),
        "fallback",
      ),
    ).toContain("Gemini quota");
  });

  it("explains a missing resource without echoing the internal route", () => {
    const message = describeApiError(apiError(404, "Route not found: POST /api/conversations//messages"), "fallback");

    expect(message).not.toContain("/api/conversations");
    expect(message).toContain("no longer exists");
  });

  it("falls back for unknown failures", () => {
    expect(describeApiError(new Error("weird"), "Unable to save feedback")).toBe("Unable to save feedback");
  });
});

describe("describeGenerationError", () => {
  it("does not toast vendor auth failures as Invalid credentials", () => {
    expect(describeGenerationError("PROVIDER_INVALID_CREDENTIALS", "Invalid credentials")).toContain(
      "could not be reached",
    );
    expect(describeGenerationError("PROVIDER_INVALID_CREDENTIALS", "Invalid credentials")).not.toMatch(
      /invalid credentials/i,
    );
  });

  it("keeps a specific generation message when it is not login language", () => {
    expect(describeGenerationError("PROVIDER_RATE_LIMITED", "Provider rate limit reached.")).toBe(
      "Provider rate limit reached.",
    );
  });

  it("explains a high-demand outage when the server sent no copy", () => {
    expect(describeGenerationError("PROVIDER_UNAVAILABLE")).toMatch(/high demand/i);
  });
});

describe("logApiError", () => {
  it("logs diagnostic context without the response body", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logApiError("conversations.feedback", apiError(404, "Message not found", "MESSAGE_NOT_FOUND"));

    expect(spy).toHaveBeenCalledWith("[api]", {
      context: "conversations.feedback",
      category: "notFound",
      status: 404,
      code: "MESSAGE_NOT_FOUND",
      requestId: "req-1",
    });

    spy.mockRestore();
  });
});
