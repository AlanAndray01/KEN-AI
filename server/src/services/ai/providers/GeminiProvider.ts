import { AppError } from "../../../utils/AppError.js";
import type { GenerateRequest, ProviderRuntimeConfig } from "../AIProvider.js";
import { gatewayBaseUrl, gatewayGeminiNativeBaseUrl } from "../aiGateway.js";
import { workerProviderBaseUrl, workerGeminiNativeBaseUrl } from "../workerRouting.js";
import {
  generateNativeGemini,
  requestHasInlineMedia,
  streamNativeGemini,
  type NativeGeminiAuth,
} from "./geminiNative.js";
import { OpenAICompatibleProvider } from "./OpenAICompatibleProvider.js";

/** Google's official OpenAI-compatible Gemini endpoint (AI Studio / Gemini API). */
export const GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

/**
 * Gemini adapter. Text-only turns stay on Google's OpenAI-compatible surface.
 * Image and PDF turns use native generateContent so attachments are sent as
 * `inlineData` parts instead of being dropped by the compat normalizer.
 */
export class GeminiProvider extends OpenAICompatibleProvider {
  constructor(config: ProviderRuntimeConfig) {
    super({
      ...config,
      type: "gemini",
      credentials: {
        ...config.credentials,
        baseUrl: config.credentials.baseUrl || GEMINI_OPENAI_BASE_URL,
      },
    });
  }

  override async generate(request: GenerateRequest) {
    if (!requestHasInlineMedia(request.messages)) {
      return super.generate(request);
    }
    return generateNativeGemini(request, this.nativeAuth());
  }

  override async *stream(request: GenerateRequest) {
    if (!requestHasInlineMedia(request.messages)) {
      yield* super.stream(request);
      return;
    }
    yield* streamNativeGemini(request, this.nativeAuth());
  }

  /**
   * The native surface is a different path from the compat one, so it is
   * derived from the route this adapter was actually given — never from global
   * gateway state. Text and media therefore always take the same route, and the
   * gateway token only ever travels to the gateway.
   */
  private nativeAuth(): NativeGeminiAuth {
    const apiKey = this.credentials.apiKey;
    if (!apiKey) {
      throw new AppError("No AI provider configured.", { statusCode: 503, code: "PROVIDER_NOT_CONFIGURED" });
    }
    const route = nativeRouteFor(this.credentials.baseUrl);
    if (route.kind === "unsupported") {
      throw new AppError(
        "This Gemini endpoint can't read images or PDFs. Remove the attachment, or ask an administrator to use the standard Gemini route.",
        { statusCode: 400, code: "MEDIA_ROUTE_UNSUPPORTED", expose: true },
      );
    }
    if (route.kind === "gateway" || route.kind === "worker") {
      return {
        apiKey,
        baseUrl: route.baseUrl,
        ...(route.kind === "gateway" && this.credentials.gatewayToken ? { gatewayToken: this.credentials.gatewayToken } : {}),
      };
    }
    return { apiKey };
  }
}

type NativeRoute = { kind: "direct" } | { kind: "gateway" | "worker"; baseUrl: string } | { kind: "unsupported" };

/** Map the compat base URL in use to the native generateContent route that matches it. */
export function nativeRouteFor(compatBaseUrl: string | undefined): NativeRoute {
  const base = (compatBaseUrl ?? GEMINI_OPENAI_BASE_URL).replace(/\/$/, "");
  if (base === GEMINI_OPENAI_BASE_URL) return { kind: "direct" };
  const worker = workerProviderBaseUrl("gemini");
  const workerNative = workerGeminiNativeBaseUrl();
  if (worker && workerNative && base === worker) return { kind: "worker", baseUrl: workerNative };
  const gateway = gatewayBaseUrl("gemini");
  const native = gatewayGeminiNativeBaseUrl();
  if (gateway && native && base === gateway.replace(/\/$/, "")) return { kind: "gateway", baseUrl: native };
  // A custom proxy's native addressing is unknown. Refusing beats sending the
  // attachment somewhere the administrator did not route Gemini.
  return { kind: "unsupported" };
}
