import { AppError } from "../../utils/AppError.js";
import { env } from "../../config/env.js";
import type { ProviderCredentials } from "./AIProvider.js";
import { gatewayBaseUrl } from "./aiGateway.js";

/** Users may supply keys, but only administrators may authorize destinations.
 * This exact-endpoint allowlist avoids DNS rebinding/redirect bypasses on
 * caller-controlled hosts. Local Ollama must be explicitly configured by admin.
 */
export function assertUserEndpoint(candidate: string | undefined, approved: string | undefined): void {
  if (!candidate) return;
  if (!approved || candidate.replace(/\/$/, "") !== approved.replace(/\/$/, "")) {
    throw new AppError("Custom endpoints must be configured by an administrator.", {
      statusCode: 400, code: "PROVIDER_ENDPOINT_NOT_ALLOWED",
    });
  }
}

/** Attach a platform Gateway token only to this installation's actual route. */
export function runtimeCredentials(providerId: string, input: ProviderCredentials): ProviderCredentials {
  const approvedGateway = gatewayBaseUrl(providerId);
  const { gatewayToken: _ignored, ...credentials } = input;
  return {
    ...credentials,
    ...(approvedGateway && input.baseUrl?.replace(/\/$/, "") === approvedGateway && env.CF_AI_GATEWAY_TOKEN
      ? { gatewayToken: env.CF_AI_GATEWAY_TOKEN } : {}),
  };
}
