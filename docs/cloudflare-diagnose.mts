// Read-only routing and credential checks. --chat adds two tiny inference probes.
// Run: node --import tsx docs/cloudflare-diagnose.mts [--chat]
import mongoose from "mongoose";
import { env } from "../server/src/config/env.ts";
import { AIProvider } from "../server/src/models/AIProvider.ts";
import { resolveCredentials } from "../server/src/services/ai/credentials.ts";
import { gatewayBaseUrl } from "../server/src/services/ai/aiGateway.ts";
import { runtimeCredentials } from "../server/src/services/ai/endpointPolicy.ts";

function endpoint(value: string | undefined): string | undefined {
  return value?.replace(/\/accounts\/[^/]+/, "/accounts/<account>")
    .replace(/gateway\.ai\.cloudflare\.com\/v1\/[^/]+/, "gateway.ai.cloudflare.com/v1/<account>");
}

async function probe(label: string, url: string, key?: string, gatewayToken?: string, body?: unknown) {
  try {
    const response = await fetch(url, {
      method: body ? "POST" : "GET", redirect: "error",
      headers: {
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
        ...(gatewayToken ? { "cf-aig-authorization": `Bearer ${gatewayToken}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    const raw = await response.text();
    let payload: any;
    try { payload = JSON.parse(raw); } catch { payload = undefined; }
    const content = payload?.choices?.[0]?.message?.content;
    const errors = payload?.errors ?? (payload?.error ? [payload.error] : []);
    const safeErrors = errors.map((error: any) => ({ code: error.code, message: error.message }))
      .map((error: any) => ({ ...error, message: String(error.message ?? "").split(key ?? "\0").join("<redacted>")
        .split(gatewayToken ?? "\0").join("<redacted>") }));
    console.log(JSON.stringify({ label, status: response.status, success: payload?.success,
      modelCount: payload?.result?.length ?? payload?.data?.length,
      ...(body ? { hasContent: typeof content === "string" && content.trim().length > 0 } : {}),
      ...(safeErrors.length ? { errors: safeErrors } : {}),
      ...(response.headers.get("content-type")?.includes("text/event-stream") ? {
        hasDelta: /"content"\s*:\s*"[^"\s]/.test(raw), done: raw.includes("[DONE]") } : {}),
    }));
  } catch (error) {
    const e = error as Error & { cause?: { code?: string } };
    console.log(JSON.stringify({ label, networkError: e.name, code: e.cause?.code }));
  }
}

console.log(JSON.stringify({ cloudflareToken: Boolean(env.CF_TOKEN), accountId: Boolean(env.CF_ACCOUNT_ID),
  gatewayToken: Boolean(env.CF_AI_GATEWAY_TOKEN), gateway: env.CF_AI_GATEWAY,
  imageProvider: env.IMAGE_GENERATION_PROVIDER, workerKeyInProcess: Boolean(process.env.KEN_API_KEY) }));

try {
  if (env.MONGODB_URI) {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
    const records = await AIProvider.find({ providerId: { $in: ["cloudflare", "groq", "gemini"] } })
      .select("providerId type enabled baseUrl metadata.baseUrlSource lastTestStatus").lean();
    for (const record of records) console.log(JSON.stringify({ provider: record.providerId, type: record.type,
      enabled: record.enabled, storedEndpoint: endpoint(record.baseUrl ?? undefined),
      baseUrlSource: (record.metadata as any)?.baseUrlSource, lastTestStatus: record.lastTestStatus }));
    for (const id of ["cloudflare", "groq", "gemini"]) {
      const resolved = await resolveCredentials(id);
      console.log(JSON.stringify({ provider: id, configured: resolved?.configured, enabled: resolved?.enabled,
        credentialSource: resolved?.source, resolvedEndpoint: endpoint(resolved?.baseUrl) }));
      // Never send a Workers AI token to a custom Worker just to guess its secret.
      if (id === "cloudflare" && resolved?.baseUrl?.includes("workers.dev") && resolved.source === "database") {
        await probe("configured Worker models", `${resolved.baseUrl.replace(/\/$/, "")}/models`, resolved.apiKey);
      }
    }
  }
} catch (error) {
  console.log(JSON.stringify({ databaseError: (error as Error).name }));
} finally {
  await mongoose.disconnect();
}

if (env.CF_ACCOUNT_ID && env.CF_TOKEN) {
  const direct = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/v1`;
  await probe("native Cloudflare catalog", direct.replace(/\/v1$/, "/models/search"), env.CF_TOKEN);
  if (process.argv.includes("--chat")) {
    const body = { model: "@cf/meta/llama-3.2-3b-instruct", messages: [{ role: "user", content: "Reply pong." }], max_tokens: 16 };
    await probe("direct chat", `${direct}/chat/completions`, env.CF_TOKEN, undefined, body);
    const gateway = gatewayBaseUrl("cloudflare");
    if (gateway) {
      const credentials = runtimeCredentials("cloudflare", { apiKey: env.CF_TOKEN, baseUrl: gateway });
      await probe("gateway chat", `${gateway}/chat/completions`, credentials.apiKey, credentials.gatewayToken, body);
    }
  }
}
