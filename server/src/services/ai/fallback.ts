import { AppError } from "../../utils/AppError.js";
import { isAbortError } from "../../utils/abort.js";

const NON_RETRYABLE_CODES = new Set([
  "MODEL_UNAVAILABLE",
  "PROVIDER_NOT_CONFIGURED",
  "PROVIDER_INVALID_CREDENTIALS",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "RATE_LIMITED",
]);

export function isRetryableProviderError(error: unknown): boolean {
  if (isAbortError(error)) return false;
  if (error instanceof AppError) {
    if (NON_RETRYABLE_CODES.has(error.code)) return false;
    return error.statusCode >= 500 || error.statusCode === 429 || error.code === "PROVIDER_ERROR";
  }
  return true;
}
