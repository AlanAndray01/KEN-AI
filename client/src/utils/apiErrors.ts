import { ApiError } from "@/services/api";

export type ApiErrorCategory =
  | "authentication"
  | "authorization"
  | "validation"
  | "notFound"
  | "rateLimited"
  | "server"
  | "network"
  | "unknown";

export function categorizeApiError(error: unknown): ApiErrorCategory {
  if (error instanceof ApiError) {
    if (error.code === "PROVIDER_INVALID_CREDENTIALS") return "server";
    if (error.status === 401) return "authentication";
    if (error.status === 403) return "authorization";
    if (error.status === 404) return "notFound";
    if (error.status === 429) return "rateLimited";
    if (error.status >= 500) return "server";
    if (error.status >= 400) return "validation";
    return "unknown";
  }
  // fetch() rejects with TypeError when the request never reached the server.
  if (error instanceof TypeError) return "network";
  return "unknown";
}

/**
 * Maps a failure to a specific, safe sentence for the user. Server messages are
 * already redacted and are preferred for validation errors because they name the
 * offending field; every other category gets a message that says what to do next.
 */
export function describeApiError(error: unknown, fallback: string): string {
  const category = categorizeApiError(error);

  switch (category) {
    case "authentication":
      return "Your session expired. Sign in again to continue.";
    case "authorization":
      return "You do not have permission to do that.";
    case "notFound":
      if (error instanceof ApiError && error.code === "MODEL_UNAVAILABLE" && error.message) {
        return error.message;
      }
      return "That item no longer exists. Refresh the page and try again.";
    case "rateLimited":
      if (error instanceof ApiError && error.code === "PROVIDER_RATE_LIMITED" && error.message) {
        return error.message;
      }
      return "Too many requests to this app. Wait a moment and try again.";
    case "server":
      if (error instanceof ApiError && error.code === "PROVIDER_INVALID_CREDENTIALS") {
        return "That model could not be reached. Try another model, or retry this turn.";
      }
      return "The server could not complete that request. Try again shortly.";
    case "network":
      return "Cannot reach the server. Check your connection and try again.";
    case "validation":
      return error instanceof ApiError && error.message ? error.message : fallback;
    default:
      return fallback;
  }
}

/**
 * Copy for an SSE generation error. A vendor/gateway 401 must never reuse
 * login language — that is what produced the "Invalid credentials" popup.
 */
export function describeGenerationError(code?: string, message?: string): string {
  if (code === "PROVIDER_INVALID_CREDENTIALS") {
    return "That model could not be reached. Try another model, or retry this turn.";
  }
  if (code === "PROVIDER_RATE_LIMITED") {
    if (message && !/invalid credentials/i.test(message)) return message;
    return "This model is rate limited right now. Retry this turn, or pick another model.";
  }
  if (code === "PROVIDER_UNAVAILABLE") {
    if (message && !/invalid credentials/i.test(message)) return message;
    return "This model is currently experiencing high demand. Retry this turn, or pick another model.";
  }
  if (message && !/invalid credentials/i.test(message)) return message;
  return "Generation failed";
}

/** Structured developer log. Carries no credentials, cookies, or payload bodies. */
export function logApiError(context: string, error: unknown): void {
  const detail: Record<string, unknown> = { context, category: categorizeApiError(error) };

  if (error instanceof ApiError) {
    detail["status"] = error.status;
    detail["code"] = error.code;
    if (error.requestId) detail["requestId"] = error.requestId;
  } else if (error instanceof Error) {
    detail["name"] = error.name;
  }

  console.error("[api]", detail);
}
