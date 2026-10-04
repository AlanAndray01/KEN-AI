import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config/env.js")>();
  return { ...actual, env: { ...actual.env, CLOUDFLARE_WORKER_URL: "https://worker.example/v1",
    KEN_API_KEY: "shared-worker-secret", CF_AI_GATEWAY_TOKEN: "stale-gateway-secret", CF_ACCOUNT_ID: "acct",
    GEMINI_API_KEY: undefined, OPENAI_API_KEY: undefined, OPENROUTER_API_KEY: undefined } };
});
vi.mock("../../models/AIProvider.js", () => ({ AIProvider: { findOne: vi.fn(), find: vi.fn() } }));
vi.mock("../../models/UserProviderCredential.js", () => ({ UserProviderCredential: { findOne: vi.fn() } }));
vi.mock("../../models/AIModel.js", () => ({ AIModel: { find: vi.fn() } }));

import { env } from "../../config/env.js";
import { AIProvider } from "../../models/AIProvider.js";
import { UserProviderCredential } from "../../models/UserProviderCredential.js";
import { AIModel } from "../../models/AIModel.js";
import { workerProviderBaseUrl, WORKER_PROVIDER_IDS } from "./workerRouting.js";
import { describeConfiguredSecret, getEnvApiKey, resolveCredentials } from "./credentials.js";
import { gatewayEnabled } from "./aiGateway.js";
import { runtimeCredentials } from "./endpointPolicy.js";
import { invalidateCredentialCaches } from "./credentialCache.js";
import { ModelRegistry } from "./ModelRegistry.js";
import { getBuiltInProvider } from "./catalog.js";
import { createProviderAdapter } from "./createProviderAdapter.js";
import { nativeRouteFor } from "./providers/GeminiProvider.js";
import { GeminiImageProvider } from "../image/GeminiImageProvider.js";

beforeEach(() => {
  vi.clearAllMocks();
  invalidateCredentialCaches();
  env.CLOUDFLARE_WORKER_URL = "https://worker.example/v1";
  env.KEN_API_KEY = "shared-worker-secret";
  vi.mocked(AIProvider.findOne).mockResolvedValue(null);
  vi.mocked(AIProvider.find).mockResolvedValue([]);
  vi.mocked(AIModel.find).mockResolvedValue([]);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("Worker routing", () => {
  it.each(WORKER_PROVIDER_IDS)("uses Worker credentials for %s despite saved or personal vendor keys", async (providerId) => {
    vi.mocked(AIProvider.findOne).mockResolvedValue({ id: "saved", providerId, name: providerId,
      type: "openai-compatible", enabled: true, baseUrl: "https://stale-vendor.example/v1",
      metadata: { baseUrlSource: "admin" }, keyLastFour: "old!", capabilities: ["text"] } as never);
    const resolved = await resolveCredentials(providerId, "personal-user");
    const baseUrl = providerId === "cloudflare" ? "https://worker.example/v1"
      : `https://worker.example/providers/${providerId}/v1`;
    expect(resolved).toMatchObject({ baseUrl, apiKey: "shared-worker-secret", configured: true, source: "environment" });
    expect(UserProviderCredential.findOne).not.toHaveBeenCalled();
    expect(getEnvApiKey(providerId)).toBe("shared-worker-secret");
    expect(await describeConfiguredSecret(providerId, "personal-user")).toMatchObject({ source: "environment", hasUserKey: false });
    expect(runtimeCredentials(providerId, resolved!)).not.toHaveProperty("gatewayToken");
  });

  it("disables AI Gateway when Worker mode is active, even with an old token", () => {
    expect(gatewayEnabled()).toBe(false);
  });

  it("does not reroute unrelated providers", () => {
    expect(workerProviderBaseUrl("openai")).toBeUndefined();
    expect(workerProviderBaseUrl("ollama")).toBeUndefined();
  });

  it("refuses to configure Worker providers without the shared secret", async () => {
    env.KEN_API_KEY = undefined;
    expect(await resolveCredentials("groq")).toMatchObject({ configured: false });
    expect(getEnvApiKey("groq")).toBeUndefined();
  });

  it("preserves direct routing when Worker mode is not enabled", () => {
    env.CLOUDFLARE_WORKER_URL = undefined;
    expect(workerProviderBaseUrl("groq")).toBeUndefined();
    expect(gatewayEnabled()).toBe(true);
  });

  it("sends an Express chat completion to the Worker rather than the vendor", async () => {
    const resolved = (await resolveCredentials("groq"))!;
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: "hello" }, finish_reason: "stop" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = createProviderAdapter({ id: "groq", name: "Groq", type: "groq",
      credentials: runtimeCredentials("groq", resolved) });
    await adapter.generate({ modelId: "chosen", messages: [{ role: "user", content: "hi" }] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://worker.example/providers/groq/v1/chat/completions");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer shared-worker-secret");
    expect(new Headers(init.headers).has("cf-aig-authorization")).toBe(false);
  });

  it("routes Gemini image/PDF input through the native Worker endpoint with the shared secret", async () => {
    const resolved = (await resolveCredentials("gemini"))!;
    const fetchMock = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: "PDF summary" }] }, finishReason: "STOP" }] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(nativeRouteFor(resolved.baseUrl)).toEqual({ kind: "worker", baseUrl: "https://worker.example/providers/gemini/v1beta" });
    const adapter = createProviderAdapter({ id: "gemini", name: "Gemini", type: "gemini", credentials: runtimeCredentials("gemini", resolved) });
    const result = await adapter.generate({ modelId: "gemini-3.5-flash-lite", messages: [{ role: "user", content: "Summarize",
      parts: [{ type: "inline", mimeType: "application/pdf", data: "JVBER" }] }] });
    expect(result.content).toBe("PDF summary");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://worker.example/providers/gemini/v1beta/models/gemini-3.5-flash-lite:generateContent");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer shared-worker-secret");
    expect(new Headers(init.headers).has("x-goog-api-key")).toBe(false);
    expect(JSON.parse(String(init.body)).contents[0].parts).toContainEqual({ inlineData: { mimeType: "application/pdf", data: "JVBER" } });
  });

  it("routes Gemini image generation through the Worker", async () => {
    const fetchMock = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "aGk=" } }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GeminiImageProvider("shared-worker-secret", { runUrl: "https://worker.example/providers/gemini/v1beta/models/image-model:generateContent" });
    expect((await provider.generate({ prompt: "a cat" })).providerId).toBe("gemini");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("worker.example/providers/gemini");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer shared-worker-secret");
    expect(new Headers(init.headers).has("x-goog-api-key")).toBe(false);
  });

  it("hides models when their vendor Worker secrets or discovery are unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not configured", { status: 503 })));
    const models = await new ModelRegistry().listAllModels();
    expect(models.filter((model) => (WORKER_PROVIDER_IDS as readonly string[]).includes(model.providerId))
      .every((model) => !model.available)).toBe(true);
  });

  it("advertises only supported models returned by each Worker provider", async () => {
    const selected = new Map(WORKER_PROVIDER_IDS.map((id) => [id, getBuiltInProvider(id)!.models[0]!]));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const provider = WORKER_PROVIDER_IDS.find((id) => id !== "cloudflare" && url.includes(`/providers/${id}/`)) ?? "cloudflare";
      const model = selected.get(provider)!;
      return Response.json({ data: [{ ...model, context_window: model.contextWindow }] });
    }));
    const models = await new ModelRegistry().listAllModels();
    for (const id of WORKER_PROVIDER_IDS) {
      const available = models.filter((model) => model.providerId === id && model.available);
      expect(available.map((model) => model.id)).toEqual([selected.get(id)!.id]);
    }
  });
});
