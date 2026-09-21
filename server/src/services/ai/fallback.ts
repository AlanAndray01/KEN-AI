import { AppError } from "../../utils/AppError.js";
import { isAbortError } from "../../utils/abort.js";

const NON_RETRYABLE_CODES = new Set([
  "MODEL_UNAVAILABLE",
  "PROVIDER_NOT_CONFIGURED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "RATE_LIMITED",
]);

export function isProviderQuotaError(error: unknown): boolean {
  return error instanceof AppError && error.code === "PROVIDER_RATE_LIMITED";
}

export function isRetryableProviderError(error: unknown): boolean {
  if (isAbortError(error)) return false;
  if (error instanceof AppError) {
    if (NON_RETRYABLE_CODES.has(error.code)) return false;
    return (
      error.statusCode >= 500 ||
      error.statusCode === 429 ||
      error.code === "PROVIDER_ERROR" ||
      error.code === "PROVIDER_RATE_LIMITED" ||
      error.code === "PROVIDER_UNAVAILABLE" ||
      error.code === "PROVIDER_INVALID_CREDENTIALS" ||
      isProviderLeaveError(error)
    );
  }
  return true;
}

/**
 * Vendor auth / client rejection (401/403). The key is unusable for every
 * model on that provider, so retry must leave the provider rather than
 * bouncing Lite → Flash → Pro on the same credentials.
 */
export function isProviderLeaveError(error: unknown): boolean {
  if (!(error instanceof AppError)) return false;
  if (error.code === "PROVIDER_INVALID_CREDENTIALS") return true;
  const httpStatus = error.extra && typeof error.extra.httpStatus === "number" ? error.extra.httpStatus : undefined;
  return httpStatus === 401 || httpStatus === 403;
}
