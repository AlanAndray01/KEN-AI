// Offline audit reproduction. No database or external HTTP requests are made.
// Run from the repository root: node --import tsx docs/audit-routing-repro.mts
import assert from "node:assert/strict";
import { env } from "../server/src/config/env.ts";
import { AIProvider } from "../server/src/models/AIProvider.ts";
import { UserProviderCredential } from "../server/src/models/UserProviderCredential.ts";
import { resolveCredentials } from "../server/src/services/ai/credentials.ts";
import { testUserCredential } from "../server/src/services/ai/providerService.ts";
import { GeminiProvider } from "../server/src/services/ai/providers/GeminiProvider.ts";
import { bootstrapProviders } from "../server/src/services/ai/bootstrap.ts";
import { AIModel } from "../server/src/models/AIModel.ts";
import { ExternalAnalysisRunner } from "../server/src/services/analysis/ExternalAnalysisRunner.ts";

Object.assign(env, {
  GROQ_API_KEY: "audit-fake-platform-key", GROQ_KEYS: undefined,
  CF_ACCOUNT_ID: "audit-account", CF_AI_GATEWAY_TOKEN: "audit-fake-gateway-token",
  CF_AI_GATEWAY: "audit-gateway",
});
const providers = new Map<string, Record<string, unknown>>();
AIProvider.findOne = ((filter: { providerId: string }) => providers.get(filter.providerId) ?? null) as never;
AIProvider.create = (async (record: Record<string, unknown>) => {
  providers.set(record.providerId as string, record);
  return record;
}) as never;
UserProviderCredential.findOne = (() => ({ select: async () => null })) as never;
let geminiReenabled = false;
AIModel.findOne = (async (filter: { providerId: string }) => ({
  updateOne: async (update: { $set: { enabled?: boolean } }) => {
    if (filter.providerId === "gemini" && update.$set.enabled === true) geminiReenabled = true;
  },
})) as never;
AIModel.updateMany = (async () => ({})) as never;
await bootstrapProviders();
const resolved = await resolveCredentials("groq");
assert.equal(new URL(resolved!.baseUrl!).hostname, "api.groq.com");
console.log("CONFIRMED: bootstrap saves vendor URLs which override the enabled AI Gateway.");
assert.equal(geminiReenabled, true);
console.log("CONFIRMED: bootstrap writes enabled=true over existing Gemini model settings.");

const requests: { url: string; headers: Headers }[] = [];
globalThis.fetch = async (input, init) => {
  requests.push({ url: String(input), headers: new Headers(init?.headers) });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "audit response" }] } }] }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
};
await testUserCredential("audit-user", "groq", { baseUrl: "https://audit-controlled.invalid/v1" });
assert.equal(requests[0]?.url, "https://audit-controlled.invalid/v1/models");
assert.equal(requests[0]?.headers.get("Authorization"), "Bearer audit-fake-platform-key");
console.log("CONFIRMED: user-controlled test URL receives the fake platform credential without supplying a user key.");

const provider = new GeminiProvider({
  id: "gemini", name: "Gemini", type: "gemini",
  credentials: { apiKey: "audit-fake-user-key", baseUrl: "https://audit-worker.invalid/v1" },
});
await provider.generate({
  providerId: "gemini", modelId: "audit-model",
  messages: [{ role: "user", content: "describe", parts: [{ type: "inline", mimeType: "image/png", data: "AA==" }] }],
});
assert.equal(new URL(requests[1]!.url).hostname, "gateway.ai.cloudflare.com");
assert.equal(requests[1]?.headers.has("cf-aig-authorization"), false);
console.log("CONFIRMED: Gemini media ignores the custom base URL and calls the Gateway without its configured auth token.");

await testUserCredential("audit-user", "groq", {
  apiKey: "audit-fake-user-key",
  baseUrl: "https://gateway.ai.cloudflare.com/v1/audit-account/audit-gateway/groq",
});
assert.equal(requests[2]?.headers.has("cf-aig-authorization"), false);
console.log("CONFIRMED: credential-test probes omit the configured Gateway auth token.");

let analysisRequests = 0;
globalThis.fetch = async () => {
  analysisRequests++;
  return new Response(JSON.stringify({ status: "completed", output: "2" }), { status: 200 });
};
const runner = new ExternalAnalysisRunner("https://audit-runner.invalid");
const submitted = await runner.submit({ userId: "audit-user", language: "python", code: "print(1+1)" });
const job = await runner.get("audit-user", submitted.id);
assert.equal(job.status, "queued");
assert.equal(analysisRequests, 1);
console.log("CONFIRMED: a completed runner response is discarded; reading the job only returns local queued state.");
