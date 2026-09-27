/**
 * One-shot Flux URL probe. Prints status and JSON keys only — never tokens or image bytes.
 * Delete after use.
 */
/* global console, process, fetch */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(import.meta.dirname, "../.env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const accountId = env.CF_ACCOUNT_ID;
const token = env.CF_TOKEN;
const gateway = env.CF_AI_GATEWAY || "ken-ai-gateway";
const gatewayToken = env.CF_AI_GATEWAY_TOKEN;
const model = "@cf/black-forest-labs/flux-1-schnell";

if (!accountId || !token) {
  console.log("missing CF_ACCOUNT_ID or CF_TOKEN (names only)");
  process.exit(1);
}

function summarize(text) {
  try {
    const json = JSON.parse(text);
    const result = json.result && typeof json.result === "object" ? json.result : {};
    return {
      keys: Object.keys(json),
      resultKeys: Object.keys(result),
      success: json.success,
      hasResultImage: typeof result.image === "string" && result.image.length > 0,
      hasRootImage: typeof json.image === "string" && json.image.length > 0,
      errors: Array.isArray(json.errors)
        ? json.errors.map((e) => ({ code: e?.code, message: String(e?.message ?? "").slice(0, 180) }))
        : undefined,
      googleError:
        json.error && typeof json.error === "object"
          ? {
              code: json.error.code,
              status: json.error.status,
              message: String(json.error.message ?? "").slice(0, 220),
            }
          : undefined,
      hasInlineImage: Boolean(
        Array.isArray(json.candidates) &&
          json.candidates.some(
            (c) =>
              Array.isArray(c?.content?.parts) &&
              c.content.parts.some((p) => p?.inlineData?.data || p?.inline_data?.data),
          ),
      ),
      message: typeof json.message === "string" ? json.message.slice(0, 180) : undefined,
    };
  } catch {
    return { parse: "not-json", preview: text.replace(/[A-Za-z0-9+/=]{40,}/g, "[redacted]").slice(0, 180) };
  }
}

async function probe(label, url, headers, body) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    const path = url.replace(accountId, "[account]").replace(gateway, "[gateway]");
    console.log(
      JSON.stringify({
        label,
        status: response.status,
        contentType: response.headers.get("content-type"),
        ms: Date.now() - started,
        path,
        ...summarize(text),
      }),
    );
  } catch (error) {
    console.log(JSON.stringify({ label, fetchError: error instanceof Error ? error.name : "error" }));
  }
}

const cfAuth = { Authorization: `Bearer ${token}` };
const aigAuth = gatewayToken ? { "cf-aig-authorization": `Bearer ${gatewayToken}` } : {};

await probe(
  "direct-run",
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
  cfAuth,
  { prompt: "a red cube" },
);

await probe(
  "direct-run-gateway-id",
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
  { ...cfAuth, "cf-aig-gateway-id": gateway },
  { prompt: "a red cube" },
);

await probe(
  "ken-gateway-no-run",
  `https://gateway.ai.cloudflare.com/v1/${accountId}/${gateway}/workers-ai/${model}`,
  { ...cfAuth, ...aigAuth },
  { prompt: "a red cube" },
);

await probe(
  "sdk-gateway-run",
  `https://gateway.ai.cloudflare.com/v1/${accountId}/${gateway}/workers-ai/run/${model}`,
  { ...cfAuth, ...aigAuth },
  { prompt: "a red cube" },
);

await probe(
  "envelope-ai-run",
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`,
  { ...cfAuth, "cf-aig-gateway-id": gateway },
  { model, input: { prompt: "a red cube" } },
);

await probe(
  "chat-completions-flux",
  `https://gateway.ai.cloudflare.com/v1/${accountId}/${gateway}/workers-ai/v1/chat/completions`,
  { ...cfAuth, ...aigAuth },
  { model, messages: [{ role: "user", content: "draw a cartoon cat" }], max_tokens: 16 },
);

const geminiKey = env.GEMINI_API_KEY;
if (geminiKey) {
  for (const [label, modelId, modalities] of [
    ["gemini-3.1-image-only", "gemini-3.1-flash-image", ["IMAGE"]],
    ["gemini-3.1-text-image", "gemini-3.1-flash-image", ["TEXT", "IMAGE"]],
    ["gemini-2.5-flash-image", "gemini-2.5-flash-image", ["TEXT", "IMAGE"]],
  ]) {
    await probe(
      label,
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
      { "x-goog-api-key": geminiKey },
      {
        contents: [{ role: "user", parts: [{ text: "a simple red cube, no text" }] }],
        generationConfig: { responseModalities: modalities },
      },
    );
  }
} else {
  console.log(JSON.stringify({ label: "gemini", skipped: "no GEMINI_API_KEY" }));
}
