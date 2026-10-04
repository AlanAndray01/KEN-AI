import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";
import { getBuiltInProvider } from "../server/src/services/ai/catalog.js";
import { DEFAULT_CLOUDFLARE_MODEL_ID } from "@Ken/shared";

// Print only statuses and public model IDs. Never print keys, headers or raw errors.
const local = parse(readFileSync(new URL("../server/.env", import.meta.url)));
const secret = local.KEN_API_KEY;
const worker = "https://kenai.syedarslanshah7861.workers.dev";
const result: Record<string, unknown> = { checkedAt: new Date().toISOString(), checks: [] };
const outputName = process.argv.find((arg) => arg.startsWith("--output="))?.slice("--output=".length);
if (outputName && !/^[a-zA-Z0-9_-]+\.json$/.test(outputName)) throw new Error("--output must be a simple JSON filename.");
const checks = result.checks as Record<string, unknown>[];
const knownErrors = new Set(["unauthorized", "not_configured", "provider_not_configured", "provider_unavailable",
  "provider_invalid_credentials", "provider_billing_required", "provider_access_denied", "provider_network_error", "provider_timeout", "provider_redirect",
  "rate_limit_exceeded", "quota_exceeded", "model_unavailable", "model_busy", "invalid_request", "not_found", "bad_upstream_output"]);

async function request(label: string, url: string, init?: RequestInit) {
  const started = Date.now();
  try {
    const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(50_000) });
    const text = await response.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = undefined; }
    const code = knownErrors.has(body?.error?.code) ? body.error.code : undefined;
    const row: Record<string, unknown> = { label, status: response.status, ms: Date.now() - started,
      ...(Number.isInteger(body?.error?.upstreamStatus) ? { upstreamStatus: body.error.upstreamStatus } : {}),
      ...(code ? { error: code } : {}), ...(body?.ok !== undefined ? { ready: body.ok === true } : {}) };
    if (label === "express-health") {
      row.health = body?.status === "ok" || body?.status === "degraded" ? body.status : "unrecognized";
      row.database = body?.database?.status === "connected" ? "connected" : "not-confirmed-connected";
    }
    checks.push(row);
    console.log(JSON.stringify(row));
    return { response, body, text, row };
  } catch (error: any) {
    const cause = error?.cause;
    const code = typeof cause?.code === "string" && /^[A-Z_]+$/.test(cause.code) ? cause.code : "FETCH_FAILED";
    const row = { label, networkError: code, ms: Date.now() - started };
    checks.push(row); console.log(JSON.stringify(row));
    return null;
  }
}

if (!process.argv.includes("--chat-only")) await Promise.all([
  request("worker-health", `${worker}/health`),
  request("worker-custom-domain-health", "https://ai.ken-ai.tech/health"),
  request("express-health", "https://api.ken-ai.tech/api/health"),
]);

if (!secret || /<|>|your_actual|matching_secret/i.test(secret)) {
  console.log(JSON.stringify({ auth: "local KEN_API_KEY missing or placeholder; no authenticated calls made" }));
} else {
  const auth = { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
  const providers = ["cloudflare", "gemini", "groq", "cerebras", "deepseek"].filter((id) => {
    const selected = process.argv.find((arg) => arg.startsWith("--providers="))?.split("=")[1]?.split(",");
    return !selected || selected.includes(id);
  });
  const discovery = await Promise.all(providers.map(async (provider) => {
    const base = provider === "cloudflare" ? `${worker}/v1` : `${worker}/providers/${provider}/v1`;
    if (process.argv.includes("--chat-only")) {
      const model = provider === "cloudflare" ? DEFAULT_CLOUDFLARE_MODEL_ID
        : getBuiltInProvider(provider)?.models.find((item) => item.capabilities.includes("text"))?.id;
      return model ? { provider, base, model } : null;
    }
    const probe = await request(`${provider}-models`, `${base}/models`, { headers: auth });
    if (!probe?.response.ok || !Array.isArray(probe.body?.data)) {
      // Discovery failure must not prevent an independent real inference probe.
      const model = provider === "cloudflare" ? DEFAULT_CLOUDFLARE_MODEL_ID
        : getBuiltInProvider(provider)?.models.find((item) => item.capabilities.includes("text"))?.id;
      return model ? { provider, base, model } : null;
    }
    const ids: string[] = probe.body.data.map((item: any) => item?.id).filter((id: unknown): id is string =>
      typeof id === "string" && /^[A-Za-z0-9_@./:-]{1,200}$/.test(id)).map((id: string) => provider === "gemini" ? id.replace(/^models\//, "") : id);
    const supported = getBuiltInProvider(provider)?.models.filter((item) => ids.includes(item.id)) ?? [];
    const summary = { provider, modelCount: ids.length, supportedCount: supported.length, supportedIds: supported.map((model) => model.id), sampleIds: ids.slice(0, 6) };
    checks.push(summary); console.log(JSON.stringify(summary));
    const model = provider === "cloudflare" && ids.includes(DEFAULT_CLOUDFLARE_MODEL_ID)
      ? DEFAULT_CLOUDFLARE_MODEL_ID : supported.find((item) => item.capabilities.includes("text"))?.id;
    if (!model) {
      const summary = { provider, catalogHasChatModel: false };
      checks.push(summary); console.log(JSON.stringify(summary));
    }
    return model ? { provider, base, model, extraModels: process.argv.includes("--all-models")
      ? supported.filter((item) => item.capabilities.includes("text") && item.id !== model).map((item) => item.id) : [] } : null;
  }));

  if (process.argv.includes("--chat")) {
    const targets = discovery.filter((item) => item !== null).flatMap((item) => [item!,
      ...("extraModels" in item! ? item!.extraModels : []).map((model) => ({ ...item!, model }))]);
    await Promise.all(targets.map(async (item) => {
      const { provider, base, model } = item!;
      const body = { model, messages: [{ role: "user", content: "Reply with exactly OK." }], max_tokens: provider === "gemini" ? 384 : 128,
        ...(provider === "gemini" ? { reasoning_effort: model === "gemini-3.8-flash" ? "low" : "minimal" }
          : provider === "groq" && model.startsWith("qwen/") ? { reasoning_effort: "none" } : {}) };
      const probe = await request(`${provider}-chat`, `${base}/chat/completions`, { method: "POST", headers: auth, body: JSON.stringify(body) });
      if (probe) {
        const summary = { provider, model, chatHasText: typeof probe.body?.choices?.[0]?.message?.content === "string" && probe.body.choices[0].message.content.trim().length > 0 };
        checks.push(summary); console.log(JSON.stringify(summary));
      }
      if (process.argv.includes("--stream")) {
        const streamed = await request(`${provider}-stream`, `${base}/chat/completions`, {
          method: "POST", headers: auth, body: JSON.stringify({ ...body, stream: true }),
        });
        if (streamed) {
          const events = streamed.text.split(/\r?\n/).filter((line) => line.startsWith("data:"));
          const hasDelta = events.some((line) => {
            try { return Boolean(JSON.parse(line.slice(5).trim())?.choices?.some((choice: any) =>
              typeof choice?.delta?.content === "string" && choice.delta.content.trim())); }
            catch { return false; }
          });
          const summary = { provider, model, streamHasText: hasDelta,
            streamDone: events.some((line) => line.slice(5).trim() === "[DONE]") };
          checks.push(summary); console.log(JSON.stringify(summary));
        }
      }
    }));
  }
}

writeFileSync(new URL(outputName ?? (process.argv.includes("--chat-only") ? "worker-chat-check.json" : "worker-deployment-check.json"), import.meta.url), JSON.stringify(result, null, 2) + "\n");
if (checks.some((row) => row.networkError)) process.exitCode = 2;
else if (!secret || checks.some((row) => typeof row.status === "number" && row.status >= 400 || row.catalogHasChatModel === false ||
  row.chatHasText === false || row.streamHasText === false || row.streamDone === false)) process.exitCode = 1;
