/**
 * Live ping of every Cloudflare catalog model through the same URL and body
 * Ken uses in production (gateway when CF_AI_GATEWAY_TOKEN is set, otherwise
 * the direct Workers AI host).
 *
 *   npm run ping:cloudflare -w @Ken/server
 *   npm run ping:cloudflare -w @Ken/server -- --quick
 *
 * `--quick` only hits the models that Auto, fallback, titles, or Flux actually
 * call. The default run walks the whole picker catalogue.
 *
 * Skips with exit 0 when CF_ACCOUNT_ID or CF_TOKEN is missing. Never prints
 * tokens, gateway secrets, or raw image bytes.
 */
import {
  CLOUDFLARE_IMAGE_MODEL_ID,
  CLOUDFLARE_QUALITY_MODEL_ID,
  CLOUDFLARE_TINY_MODEL_ID,
  CLOUDFLARE_VISION_MODEL_ID,
  DEFAULT_CLOUDFLARE_MODEL_ID,
  isCloudflareImageModel,
} from "@Ken/shared";
import { env } from "../config/env.js";
import { GATEWAY_URL_PREFIX, gatewayBaseUrl, gatewayWorkersAiRunUrl } from "../services/ai/aiGateway.js";
import { getBuiltInProvider } from "../services/ai/catalog.js";
import { cloudflareBaseUrl, getEnvApiKey } from "../services/ai/credentials.js";
import { buildCompatibleChatBody } from "../services/ai/providers/compatibleChatBody.js";
import { redactSensitive } from "../utils/redact.js";
import { CloudflareImageProvider } from "../services/image/CloudflareImageProvider.js";

const PING_PROMPT = "Reply with the single word pong.";
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const CHAT_TIMEOUT_MS = 45_000;
const IMAGE_TIMEOUT_MS = 90_000;
const STREAM_TIMEOUT_MS = 45_000;

export const LIVE_TRAFFIC_CLOUDFLARE_IDS = [
  DEFAULT_CLOUDFLARE_MODEL_ID,
  CLOUDFLARE_TINY_MODEL_ID,
  CLOUDFLARE_VISION_MODEL_ID,
  CLOUDFLARE_QUALITY_MODEL_ID,
  CLOUDFLARE_IMAGE_MODEL_ID,
] as const;

export interface PingRow {
  modelId: string;
  kind: "chat" | "stream" | "vision" | "image";
  via: "gateway" | "direct";
  ok: boolean;
  status: number;
  ms: number;
  detail: string;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...(env.CF_AI_GATEWAY_TOKEN ? { "cf-aig-authorization": `Bearer ${env.CF_AI_GATEWAY_TOKEN}` } : {}),
  };
}

function chatBaseUrl(): string | undefined {
  return gatewayBaseUrl("cloudflare") ?? cloudflareBaseUrl();
}

function imageRunUrl(): string | undefined {
  return (
    gatewayWorkersAiRunUrl(CLOUDFLARE_IMAGE_MODEL_ID) ??
    (env.CF_ACCOUNT_ID
      ? `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/${CLOUDFLARE_IMAGE_MODEL_ID}`
      : undefined)
  );
}

function viaFor(url: string): "gateway" | "direct" {
  return url.startsWith(GATEWAY_URL_PREFIX) ? "gateway" : "direct";
}

function clipDetail(value: string): string {
  return redactSensitive(value.replace(/\s+/g, " ").trim()).slice(0, 180);
}

async function readErrorDetail(response: Response): Promise<string> {
  const body = clipDetail(await response.text().catch(() => ""));
  return body || `HTTP ${response.status}`;
}

async function pingChat(input: {
  modelId: string;
  kind: "chat" | "stream" | "vision";
  apiKey: string;
}): Promise<PingRow> {
  const baseUrl = chatBaseUrl();
  if (!baseUrl) {
    return {
      modelId: input.modelId,
      kind: input.kind,
      via: "direct",
      ok: false,
      status: 0,
      ms: 0,
      detail: "no Cloudflare base URL (CF_ACCOUNT_ID missing)",
    };
  }
  const messages =
    input.kind === "vision"
      ? [
          {
            role: "user" as const,
            content: "What color is this pixel? One word.",
            parts: [{ type: "inline" as const, mimeType: "image/png", data: TINY_PNG_B64 }],
          },
        ]
      : [{ role: "user" as const, content: PING_PROMPT }];
  const stream = input.kind === "stream";
  const body = buildCompatibleChatBody(
    { providerId: "cloudflare", modelId: input.modelId, messages, maxTokens: 16 },
    { stream, providerId: "cloudflare" },
  );
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(input.apiKey) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(stream ? STREAM_TIMEOUT_MS : CHAT_TIMEOUT_MS),
    });
    const ms = Date.now() - started;
    if (!response.ok) {
      return {
        modelId: input.modelId,
        kind: input.kind,
        via: viaFor(baseUrl),
        ok: false,
        status: response.status,
        ms,
        detail: await readErrorDetail(response),
      };
    }
    if (stream) {
      const text = await response.text();
      const hasDelta = /"delta"/.test(text) || /^data:/m.test(text);
      return {
        modelId: input.modelId,
        kind: input.kind,
        via: viaFor(baseUrl),
        ok: hasDelta,
        status: response.status,
        ms,
        detail: hasDelta ? `sse ${text.length} bytes` : "200 but no SSE delta",
      };
    }
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    return {
      modelId: input.modelId,
      kind: input.kind,
      via: viaFor(baseUrl),
      ok: content.trim().length > 0,
      status: response.status,
      ms,
      detail: content.trim()
        ? `finish=${json.choices?.[0]?.finish_reason ?? "?"} chars=${content.trim().length}`
        : "200 with empty content",
    };
  } catch (error) {
    return {
      modelId: input.modelId,
      kind: input.kind,
      via: viaFor(baseUrl),
      ok: false,
      status: 0,
      ms: Date.now() - started,
      detail: clipDetail(error instanceof Error ? error.message : "request failed"),
    };
  }
}

async function pingFlux(apiKey: string): Promise<PingRow> {
  const url = imageRunUrl();
  if (!url) {
    return {
      modelId: CLOUDFLARE_IMAGE_MODEL_ID,
      kind: "image",
      via: "direct",
      ok: false,
      status: 0,
      ms: 0,
      detail: "no Flux run URL (CF_ACCOUNT_ID missing)",
    };
  }
  if (url.startsWith(GATEWAY_URL_PREFIX) && !env.CF_AI_GATEWAY_TOKEN) {
    return {
      modelId: CLOUDFLARE_IMAGE_MODEL_ID,
      kind: "image",
      via: "gateway",
      ok: false,
      status: 0,
      ms: 0,
      detail: "gateway URL without CF_AI_GATEWAY_TOKEN",
    };
  }
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
      body: JSON.stringify({ prompt: "a tiny red square" }),
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    const ms = Date.now() - started;
    if (!response.ok) {
      return {
        modelId: CLOUDFLARE_IMAGE_MODEL_ID,
        kind: "image",
        via: viaFor(url),
        ok: false,
        status: response.status,
        ms,
        detail: await readErrorDetail(response),
      };
    }
    const payload = (await response.json()) as { result?: { image?: string } };
    const image = payload.result?.image ?? "";
    const bytes = image ? Buffer.from(image, "base64").length : 0;
    return {
      modelId: CLOUDFLARE_IMAGE_MODEL_ID,
      kind: "image",
      via: viaFor(url),
      ok: bytes > 0,
      status: response.status,
      ms,
      detail: bytes > 0 ? `image ${bytes} bytes` : "200 with no result.image",
    };
  } catch (error) {
    return {
      modelId: CLOUDFLARE_IMAGE_MODEL_ID,
      kind: "image",
      via: viaFor(url),
      ok: false,
      status: 0,
      ms: Date.now() - started,
      detail: clipDetail(error instanceof Error ? error.message : "request failed"),
    };
  }
}

/**
 * The other image models differ in request and response shape, so they are
 * pinged through the production provider itself rather than a hand-built
 * request that could drift from it.
 */
async function pingImageModel(modelId: string, apiKey: string): Promise<PingRow> {
  const runUrl = gatewayWorkersAiRunUrl(modelId);
  const provider = new CloudflareImageProvider(env.CF_ACCOUNT_ID ?? "", apiKey, {
    ...(runUrl ? { runUrlFor: (id: string) => gatewayWorkersAiRunUrl(id) } : {}),
    ...(runUrl && env.CF_AI_GATEWAY_TOKEN ? { gatewayToken: env.CF_AI_GATEWAY_TOKEN } : {}),
  });
  const via = runUrl ? viaFor(runUrl) : "direct";
  const started = Date.now();
  try {
    const image = await provider.generate({ prompt: "a tiny red square", userId: "ping", modelId });
    return {
      modelId,
      kind: "image",
      via,
      ok: image.buffer.length > 0,
      status: 200,
      ms: Date.now() - started,
      detail: `${image.mimeType} ${image.buffer.length} bytes`,
    };
  } catch (error) {
    return {
      modelId,
      kind: "image",
      via,
      ok: false,
      status: 0,
      ms: Date.now() - started,
      detail: clipDetail(error instanceof Error ? error.message : "request failed"),
    };
  }
}

function requestedIds(): string[] {
  const catalog = getBuiltInProvider("cloudflare")?.models.map((model) => model.id) ?? [];
  const quick = process.argv.includes("--quick");
  if (!quick) {
    const extra = process.argv.find((arg) => arg.startsWith("--model="));
    if (extra) return [extra.slice("--model=".length)];
    return catalog;
  }
  return LIVE_TRAFFIC_CLOUDFLARE_IDS.filter((id) => catalog.includes(id));
}

function isNeuronQuota(status: number, detail: string): boolean {
  return status === 429 && /daily free allocation|neurons/i.test(detail);
}

function formatRow(row: PingRow): string {
  const mark = row.ok ? "ok   " : isNeuronQuota(row.status, row.detail) ? "QUOTA" : "FAIL ";
  const status = String(row.status).padStart(3);
  const ms = `${row.ms}ms`.padStart(8);
  return `${mark}  ${status}  ${ms}  ${row.via.padEnd(7)}  ${row.kind.padEnd(6)}  ${row.modelId}${row.ok ? "" : `  ${row.detail}`}`;
}

export async function pingCloudflareModels(): Promise<PingRow[]> {
  const apiKey = getEnvApiKey("cloudflare");
  if (!apiKey || !env.CF_ACCOUNT_ID) {
    process.stdout.write("Cloudflare is not configured (need CF_ACCOUNT_ID and CF_TOKEN). Skipping.\n");
    return [];
  }

  const ids = requestedIds();
  const rows: PingRow[] = [];
  for (const modelId of ids) {
    if (isCloudflareImageModel(modelId)) {
      rows.push(modelId === CLOUDFLARE_IMAGE_MODEL_ID ? await pingFlux(apiKey) : await pingImageModel(modelId, apiKey));
      continue;
    }
    rows.push(await pingChat({ modelId, kind: "chat", apiKey }));
    if (modelId === DEFAULT_CLOUDFLARE_MODEL_ID) {
      rows.push(await pingChat({ modelId, kind: "stream", apiKey }));
    }
    if (modelId === CLOUDFLARE_VISION_MODEL_ID) {
      rows.push(await pingChat({ modelId, kind: "vision", apiKey }));
    }
  }
  return rows;
}

async function main(): Promise<void> {
  const rows = await pingCloudflareModels();
  if (rows.length === 0) return;

  process.stdout.write("\nCloudflare Workers AI ping\n");
  process.stdout.write(`via=${chatBaseUrl()?.startsWith(GATEWAY_URL_PREFIX) ? "gateway" : "direct"}\n\n`);
  for (const row of rows) {
    process.stdout.write(`${formatRow(row)}\n`);
  }
  const failed = rows.filter((row) => !row.ok && !isNeuronQuota(row.status, row.detail));
  const quota = rows.filter((row) => isNeuronQuota(row.status, row.detail));
  process.stdout.write(`\n${rows.filter((row) => row.ok).length} ok, ${quota.length} quota, ${failed.length} failed (${rows.length} pings)\n`);
  if (failed.length > 0) {
    process.exitCode = 1;
    return;
  }
  if (quota.length > 0) {
    process.stdout.write(
      "Auth and routing succeeded. Inference was not exercised: Workers AI daily neuron allocation is exhausted.\n",
    );
  }
}

if (process.argv[1] && /pingCloudflareModels/.test(process.argv[1])) {
  void main();
}
