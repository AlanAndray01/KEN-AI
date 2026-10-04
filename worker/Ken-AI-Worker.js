var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../shared/src/constants/index.ts
var MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
var DEFAULT_GROQ_MODEL_ID = "qwen/qwen3.8-27b";
var DEFAULT_DEEPSEEK_MODEL_ID = "deepseek-flash";
var DEFAULT_CEREBRAS_MODEL_ID = "qwen-3.8-27b";
var DEFAULT_CLOUDFLARE_MODEL_ID = "@cf/meta/llama-3.2-3b-instruct";
var CLOUDFLARE_VISION_MODEL_ID = "@cf/meta/llama-4-scout-17b-16e-instruct";
var CLOUDFLARE_QUALITY_MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
var CLOUDFLARE_IMAGE_MODEL_ID = "@cf/black-forest-labs/flux-1-schnell";

// ../shared/src/constants/cloudflareModels.ts
var TEXT_STREAM = ["text", "streaming"];
var TEXT_STREAM_TOOLS = ["text", "streaming", "tools"];
var CLOUDFLARE_DISABLED_MODEL_IDS = ["@cf/qwen/qwen3.8-27b"];
var CLOUDFLARE_EXTRA_MODELS = [
  {
    id: "@cf/openai/gpt-oss-120b",
    name: "GPT-OSS 120B (Cloudflare)",
    description: "Largest open-weight general model here; strong reasoning with tool support.",
    capabilities: TEXT_STREAM_TOOLS,
    contextWindow: 128e3
  },
  {
    id: "@cf/openai/gpt-oss-20b",
    name: "GPT-OSS 20B (Cloudflare)",
    description: "Lighter GPT-OSS tier for everyday chat.",
    capabilities: TEXT_STREAM_TOOLS,
    contextWindow: 128e3
  },
  {
    id: "@cf/qwen/qwen3.8-27b",
    name: "Qwen 3.8 27B (Cloudflare)",
    description: "262k-token window, tool calling, strong general reasoning.",
    capabilities: TEXT_STREAM_TOOLS,
    contextWindow: 262144
  },
  {
    id: "@cf/nvidia/nemotron-3-120b-a12b",
    name: "Nemotron 3 120B (Cloudflare)",
    description: "Large mixture-of-experts model for deep reasoning.",
    capabilities: TEXT_STREAM_TOOLS,
    contextWindow: 256e3
  },
  {
    id: "@cf/google/gemma-4-26b-a4b-it",
    name: "Gemma 4 26B (Cloudflare)",
    description: "Google's open Gemma 4 tier with a 256k window.",
    capabilities: TEXT_STREAM_TOOLS,
    contextWindow: 256e3
  },
  {
    id: "@cf/zai-org/glm-4.7-flash",
    name: "GLM 4.7 Flash (Cloudflare)",
    description: "Fast GLM tier with tool calling.",
    capabilities: TEXT_STREAM_TOOLS,
    contextWindow: 131072
  },
  {
    id: "@cf/ibm-granite/granite-4.0-h-micro",
    name: "Granite 4.0 H Micro (Cloudflare)",
    description: "Small IBM Granite model for quick, cheap turns.",
    capabilities: TEXT_STREAM_TOOLS,
    contextWindow: 131e3
  },
  {
    id: "@cf/mistralai/mistral-small-3.1-24b-instruct",
    name: "Mistral Small 3.1 24B (Cloudflare)",
    description: "Balanced Mistral tier with tool calling.",
    capabilities: TEXT_STREAM_TOOLS,
    contextWindow: 128e3
  },
  {
    id: "@cf/qwen/qwen3-30b-a3b-fp8",
    name: "Qwen 3 30B A3B (Cloudflare)",
    description: "Mixture-of-experts Qwen tier with tool calling.",
    capabilities: TEXT_STREAM_TOOLS,
    contextWindow: 32768
  },
  {
    id: "@cf/qwen/qwen2.5-coder-32b-instruct",
    name: "Qwen 2.5 Coder 32B (Cloudflare)",
    description: "Code-specialised model for generation and refactoring.",
    capabilities: TEXT_STREAM,
    contextWindow: 32768
  },
  {
    id: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
    name: "DeepSeek R1 Distill 32B (Cloudflare)",
    description: "Reasoning-distilled DeepSeek R1 for step-by-step problems.",
    capabilities: TEXT_STREAM,
    contextWindow: 8e4
  },
  {
    id: "@cf/qwen/qwq-32b",
    name: "QwQ 32B (Cloudflare)",
    description: "Reasoning-focused Qwen variant. 24k combined input and output.",
    capabilities: TEXT_STREAM,
    contextWindow: 24e3
  },
  {
    id: "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
    name: "SEA-LION v4 27B (Cloudflare)",
    description: "Gemma-based model tuned for South-East Asian languages.",
    capabilities: TEXT_STREAM,
    contextWindow: 128e3
  },
  {
    id: "@cf/meta/llama-3.1-8b-instruct-fp8",
    name: "Llama 3.1 8B (Cloudflare)",
    description: "Small, quick Llama tier.",
    capabilities: TEXT_STREAM,
    contextWindow: 32e3
  },
  {
    id: "@cf/meta/llama-3.2-1b-instruct",
    name: "Llama 3.2 1B (Cloudflare)",
    description: "Smallest Llama tier; fastest and cheapest here.",
    capabilities: TEXT_STREAM,
    contextWindow: 6e4
  },
  {
    id: "@cf/mistral/mistral-7b-instruct-v0.2-lora",
    name: "Mistral 7B Instruct (Cloudflare)",
    description: "Legacy Mistral 7B tier.",
    capabilities: TEXT_STREAM,
    contextWindow: 15e3
  },
  {
    id: "@cf/google/gemma-2b-it-lora",
    name: "Gemma 2B (Cloudflare)",
    description: "Very small Gemma tier for short turns.",
    capabilities: TEXT_STREAM,
    contextWindow: 8192
  },
  {
    id: "@cf/meta-llama/llama-2-7b-chat-hf-lora",
    name: "Llama 2 7B Chat (Cloudflare)",
    description: "Legacy Llama 2 chat tier.",
    capabilities: TEXT_STREAM,
    contextWindow: 8192
  }
];
var CLOUDFLARE_MODELS = [
  {
    id: CLOUDFLARE_QUALITY_MODEL_ID,
    name: "Llama 3.3 70B (Cloudflare)",
    description: "Manual quality tier. Real limit is 24k tokens, input and output combined.",
    capabilities: TEXT_STREAM,
    contextWindow: 24e3
  },
  {
    id: DEFAULT_CLOUDFLARE_MODEL_ID,
    name: "Llama 3.2 3B (Cloudflare)",
    description: "Cheap default Cloudflare fallback tier.",
    capabilities: TEXT_STREAM,
    contextWindow: 8e4
  },
  {
    id: CLOUDFLARE_VISION_MODEL_ID,
    name: "Llama 4 Scout (Cloudflare)",
    description: "Used for image prompts when Cloudflare is configured.",
    capabilities: ["text", "vision", "streaming"],
    contextWindow: 131e3
  },
  ...CLOUDFLARE_EXTRA_MODELS,
  {
    id: CLOUDFLARE_IMAGE_MODEL_ID,
    name: "Flux 1 Schnell (Cloudflare)",
    description: "Image generation. Every prompt is drawn; this is not a chat model.",
    capabilities: ["imageGeneration"]
  },
  // Further Workers AI text-to-image models, each verified with a live
  // generation on this free-plan account. Order is roughly fastest first.
  {
    id: "@cf/black-forest-labs/flux-2-klein-4b",
    name: "Flux 2 Klein 4B (Cloudflare)",
    description: "Image generation. Newer Flux, small and quick.",
    capabilities: ["imageGeneration"]
  },
  {
    id: "@cf/black-forest-labs/flux-2-klein-9b",
    name: "Flux 2 Klein 9B (Cloudflare)",
    description: "Image generation. Newer Flux with more detail than 4B.",
    capabilities: ["imageGeneration"]
  },
  {
    id: "@cf/black-forest-labs/flux-2-dev",
    name: "Flux 2 Dev (Cloudflare)",
    description: "Image generation. Highest-quality Flux; slowest and heaviest on the daily quota.",
    capabilities: ["imageGeneration"]
  },
  {
    id: "@cf/leonardo/lucid-origin",
    name: "Lucid Origin (Cloudflare)",
    description: "Image generation by Leonardo. Strong prompt adherence and text rendering.",
    capabilities: ["imageGeneration"]
  },
  {
    id: "@cf/leonardo/phoenix-1.0",
    name: "Phoenix 1.0 (Cloudflare)",
    description: "Image generation by Leonardo. Polished, photographic results.",
    capabilities: ["imageGeneration"]
  },
  {
    id: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    name: "Stable Diffusion XL (Cloudflare)",
    description: "Image generation. Classic SDXL base model.",
    capabilities: ["imageGeneration"]
  },
  {
    id: "@cf/bytedance/stable-diffusion-xl-lightning",
    name: "SDXL Lightning (Cloudflare)",
    description: "Image generation. Very fast SDXL variant.",
    capabilities: ["imageGeneration"]
  },
  {
    id: "@cf/lykon/dreamshaper-8-lcm",
    name: "DreamShaper 8 (Cloudflare)",
    description: "Image generation. Stylised, artistic images.",
    capabilities: ["imageGeneration"]
  }
];

// src/index.ts
var MODELS = CLOUDFLARE_MODELS.filter((model) => !CLOUDFLARE_DISABLED_MODEL_IDS.includes(model.id));
var ALLOWED_MODELS = MODELS.filter((model) => model.capabilities.includes("text")).map((model) => model.id);
var MAX_BODY_BYTES = 1e6;
var MAX_NATIVE_BODY_BYTES = 16e6;
var MAX_MESSAGES = 200;
var DEFAULT_MAX_TOKENS = 4096;
var MAX_OUTPUT_TOKENS = 16384;
var ROLES = /* @__PURE__ */ new Set(["system", "user", "assistant", "tool"]);
var HttpError = class extends Error {
  constructor(status, code, message, upstreamStatus) {
    super(message);
    this.status = status;
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
  status;
  code;
  upstreamStatus;
  static {
    __name(this, "HttpError");
  }
};
function errorResponse(status, code, message, upstreamStatus) {
  return Response.json({ error: { code, message, ...upstreamStatus !== void 0 ? { upstreamStatus } : {} } }, {
    status,
    headers: code === "quota_exceeded" ? { "Retry-After": String(Math.ceil((Date.UTC(
      (/* @__PURE__ */ new Date()).getUTCFullYear(),
      (/* @__PURE__ */ new Date()).getUTCMonth(),
      (/* @__PURE__ */ new Date()).getUTCDate() + 1
    ) - Date.now()) / 1e3)) } : {}
  });
}
__name(errorResponse, "errorResponse");
function mapAiError(error) {
  const raw = error;
  const message = raw?.message ?? String(error);
  const code = String(raw?.code ?? message.match(/\b(?:4006|3036|3040|5018|5016|3041|5035|5004|5007|3042|5026)\b/)?.[0] ?? "");
  if (["4006", "3036"].includes(code) || /daily free allocation|daily.*neurons/i.test(message)) {
    return new HttpError(429, "quota_exceeded", "Cloudflare AI daily limit reached. It resets at 00:00 UTC (5:00 AM PKT).");
  }
  if (["5018", "5016", "3041", "5035"].includes(code)) {
    return new HttpError(503, "model_unavailable", "This Cloudflare model is not enabled for this account. Choose another model.");
  }
  if (code === "3040" || /out of capacity|capacity temporarily/i.test(message)) {
    return new HttpError(503, "model_busy", "This Cloudflare model is temporarily out of capacity. Try another model.");
  }
  if (["5004", "5007", "3042"].includes(code)) return new HttpError(400, "invalid_request", "Cloudflare rejected the model or input.");
  return new HttpError(503, "model_unavailable", "The Cloudflare model is unavailable right now. Try another model.");
}
__name(mapAiError, "mapAiError");
async function runModel(env, model, input) {
  try {
    return await env.AI.run(model, input);
  } catch (error) {
    const mapped = mapAiError(error);
    console.error("workers-ai failed", { model, code: mapped.code });
    throw mapped;
  }
}
__name(runModel, "runModel");
async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
__name(digest, "digest");
async function keyMatches(provided, expected) {
  const [a, b] = await Promise.all([digest(provided), digest(expected)]);
  return crypto.subtle.timingSafeEqual(a, b);
}
__name(keyMatches, "keyMatches");
function presentedKey(request) {
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return bearer ?? request.headers.get("X-API-Key") ?? "";
}
__name(presentedKey, "presentedKey");
function messageText(content, vision) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = [];
    for (const part of content) {
      const item = part;
      if (item?.type === "text" && typeof item.text === "string") parts.push({ type: "text", text: item.text });
      else if (vision && item?.type === "image_url" && typeof item.image_url?.url === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(item.image_url.url)) {
        parts.push({ type: "image_url", image_url: { url: item.image_url.url } });
      } else throw new HttpError(400, "unsupported_content", "Use text, or an inline PNG/JPEG/WebP image with a vision model.");
    }
    return parts.some((part) => part.type === "image_url") ? parts : parts.map((part) => part.text).join("\n");
  }
  throw new HttpError(400, "invalid_request", "Each message needs string content.");
}
__name(messageText, "messageText");
function parseMessages(value, vision) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    throw new HttpError(400, "invalid_request", `messages must be an array of 1-${MAX_MESSAGES} items.`);
  }
  return value.map((raw) => {
    const message = raw;
    if (typeof message?.role !== "string" || !ROLES.has(message.role)) {
      throw new HttpError(400, "invalid_request", "Each message needs a valid role.");
    }
    return { role: message.role, content: messageText(message.content, vision) };
  });
}
__name(parseMessages, "parseMessages");
function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
__name(numberOrUndefined, "numberOrUndefined");
async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > maxBytes) throw new HttpError(413, "too_large", "Request body is too large.");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new HttpError(413, "too_large", "Request body is too large.");
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
  }
  throw new HttpError(400, "invalid_request", "Body must be a JSON object.");
}
__name(readJson, "readJson");
function normaliseCompletion(output, model) {
  const out = output;
  const base = { object: "chat.completion", model, created: Math.floor(Date.now() / 1e3) };
  if (Array.isArray(out?.choices)) {
    const first = out.choices[0];
    if (typeof first?.message?.content !== "string" || !first.message.content.trim()) {
      throw new HttpError(502, "bad_upstream_output", "The model returned no answer.");
    }
    return { ...base, choices: out.choices, ...out.usage ? { usage: out.usage } : {} };
  }
  if (typeof out?.response === "string" && out.response.trim()) {
    return {
      ...base,
      choices: [{ index: 0, message: { role: "assistant", content: out.response }, finish_reason: "stop" }],
      ...out.usage ? { usage: out.usage } : {}
    };
  }
  throw new HttpError(502, "bad_upstream_output", "The model returned an unrecognised response.");
}
__name(normaliseCompletion, "normaliseCompletion");
function sseChunk(payload) {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}

`);
}
__name(sseChunk, "sseChunk");
function toOpenAIStream(stream, model) {
  const decoder = new TextDecoder();
  const done = new TextEncoder().encode("data: [DONE]\n\n");
  let buffer = "";
  let finished = false;
  const handleLine = /* @__PURE__ */ __name((line, controller) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data === "[DONE]") {
      if (!finished) controller.enqueue(done);
      finished = true;
      return;
    }
    if (finished) return;
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    if (parsed.error || parsed.errors?.length) {
      const mapped = mapAiError(parsed.error ?? parsed.errors?.[0]);
      controller.enqueue(sseChunk({ error: { code: mapped.code, message: mapped.message, status: mapped.status } }));
      controller.enqueue(done);
      finished = true;
      return;
    }
    if (Array.isArray(parsed.choices)) {
      controller.enqueue(sseChunk({ object: "chat.completion.chunk", model, ...parsed }));
    } else if (typeof parsed.response === "string" && parsed.response !== "") {
      controller.enqueue(
        sseChunk({
          object: "chat.completion.chunk",
          model,
          choices: [{ index: 0, delta: { content: parsed.response } }]
        })
      );
    } else if (parsed.usage) {
      controller.enqueue(sseChunk({ object: "chat.completion.chunk", model, choices: [], usage: parsed.usage }));
    }
  }, "handleLine");
  return stream.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line.trim(), controller);
      },
      flush(controller) {
        if (buffer.trim()) handleLine(buffer.trim(), controller);
        if (!finished) controller.enqueue(done);
      }
    })
  );
}
__name(toOpenAIStream, "toOpenAIStream");
async function chatCompletions(request, env) {
  const body = await readJson(request);
  const model = body["model"];
  if (typeof model !== "string" || !ALLOWED_MODELS.includes(model)) {
    throw new HttpError(400, "unknown_model", "That model is not available on this Worker.");
  }
  const info = MODELS.find((item) => item.id === model);
  const messages = parseMessages(body["messages"], info.capabilities.includes("vision"));
  const stream = body["stream"] === true;
  const maxTokens = Math.min(
    Math.max(Math.floor(numberOrUndefined(body["max_tokens"]) ?? DEFAULT_MAX_TOKENS), 1),
    MAX_OUTPUT_TOKENS
  );
  const temperature = numberOrUndefined(body["temperature"]);
  const topP = numberOrUndefined(body["top_p"]);
  const input = {
    messages,
    max_tokens: maxTokens,
    stream,
    ...body["stream_options"] ? { stream_options: body["stream_options"] } : {},
    ...temperature !== void 0 ? { temperature } : {},
    ...topP !== void 0 ? { top_p: topP } : {}
  };
  const output = await runModel(env, model, input);
  if (stream) {
    if (!(output instanceof ReadableStream)) {
      throw new HttpError(502, "bad_upstream_output", "The model did not return a stream.");
    }
    return new Response(toOpenAIStream(output, model), {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
    });
  }
  return Response.json(normaliseCompletion(output, model));
}
__name(chatCompletions, "chatCompletions");
var VENDOR_BASES = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  groq: "https://api.groq.com/openai/v1",
  cerebras: "https://api.cerebras.ai/v1",
  deepseek: "https://api.deepseek.com/v1"
};
var keyCursor = {};
function vendorKeys(env, provider) {
  const raw = provider === "gemini" ? [env.GEMINI_KEYS, env.GEMINI_API_KEY] : provider === "groq" ? [env.GROQ_KEYS, env.GROQ_API_KEY, env.GROQ_KEY] : provider === "cerebras" ? [env.CEREBRAS_KEYS, env.CEREBRAS_API_KEY, env.CEREBRAS_KEY] : [env.DEEPSEEK_API_KEY, env.DEEPSEEK_KEY];
  return [...new Set(raw.flatMap((value) => value?.split(",").map((key) => key.trim()).filter(Boolean) ?? []))];
}
__name(vendorKeys, "vendorKeys");
async function vendorRequest(request, env, provider, operation, body) {
  const keys = vendorKeys(env, provider);
  if (!keys.length) throw new HttpError(503, "provider_not_configured", `Add the ${provider} API key to the Ken AI Worker's Secrets.`);
  const nativeGemini = provider === "gemini" && operation.startsWith("models/");
  const streaming = nativeGemini ? operation.endsWith(":streamGenerateContent") : body?.stream === true;
  if (nativeGemini) {
    if (!body || !Array.isArray(body.contents) || !body.contents.length || body.contents.length > MAX_MESSAGES) {
      throw new HttpError(400, "invalid_request", "Supply 1-200 Gemini contents.");
    }
    const config = body.generationConfig;
    if (config !== void 0 && (!config || typeof config !== "object" || Array.isArray(config))) {
      throw new HttpError(400, "invalid_request", "generationConfig must be an object.");
    }
    body = { ...body, generationConfig: {
      ...config,
      maxOutputTokens: Math.min(MAX_OUTPUT_TOKENS, Math.max(
        1,
        Math.floor(numberOrUndefined(config?.maxOutputTokens) ?? DEFAULT_MAX_TOKENS)
      ))
    } };
  }
  if (operation === "chat/completions") {
    if (!body || typeof body.model !== "string" || !body.model.trim() || body.model.length > 200 || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > MAX_MESSAGES) {
      throw new HttpError(400, "invalid_request", "Supply a model ID and 1-200 messages.");
    }
    const tokenField = body.max_completion_tokens !== void 0 ? "max_completion_tokens" : "max_tokens";
    body = { ...body, [tokenField]: Math.min(
      MAX_OUTPUT_TOKENS,
      Math.max(1, Math.floor(numberOrUndefined(body[tokenField]) ?? DEFAULT_MAX_TOKENS))
    ) };
  }
  const start = (keyCursor[provider] ?? 0) % keys.length;
  keyCursor[provider] = start + 1;
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(6e4)]);
  let failure = new HttpError(503, "provider_unavailable", `${provider} is unavailable. Try another model.`);
  for (let offset = 0; offset < keys.length; offset++) {
    let upstream;
    try {
      const url = nativeGemini ? `https://generativelanguage.googleapis.com/v1beta/${operation}${streaming ? "?alt=sse" : ""}` : `${VENDOR_BASES[provider]}/${operation}`;
      const key = keys[(start + offset) % keys.length];
      upstream = await fetch(url, {
        // workerd supports manual/follow only. Reject redirects explicitly below.
        method: body ? "POST" : "GET",
        redirect: "manual",
        signal,
        headers: {
          ...nativeGemini ? { "x-goog-api-key": key } : { Authorization: `Bearer ${key}` },
          "Content-Type": "application/json",
          Accept: streaming ? "text/event-stream" : "application/json"
        },
        ...body ? { body: JSON.stringify(body) } : {}
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      const cause = /redirect/i.test(detail) ? "redirect" : /header|ByteString|character/i.test(detail) ? "header" : /signal|abort/i.test(detail) ? "signal" : /dns|resolve/i.test(detail) ? "dns" : /tls|ssl|certificate/i.test(detail) ? "tls" : "network";
      console.warn("vendor_fetch_failed", { provider, cause });
      failure = new HttpError(
        503,
        signal.aborted ? "provider_timeout" : cause === "header" ? "provider_invalid_credentials" : "provider_network_error",
        signal.aborted ? `${provider} request timed out. Try later.` : `${provider} could not be reached from the Worker. Try later.`
      );
      if (signal.aborted) break;
      continue;
    }
    if (!upstream.ok) {
      const status = upstream.status;
      await upstream.body?.cancel();
      if (status >= 300 && status < 400) {
        throw new HttpError(503, "provider_redirect", `${provider} returned an unexpected redirect. Check the provider endpoint.`, status);
      }
      if (status === 400 || status === 404 || status === 422) {
        throw new HttpError(400, "invalid_request", `${provider} rejected the model or input. Check the selected model and parameters.`, status);
      }
      const code = status === 401 ? "provider_invalid_credentials" : status === 402 ? "provider_billing_required" : status === 403 ? "provider_access_denied" : status === 429 ? "rate_limit_exceeded" : "provider_unavailable";
      const message = status === 401 ? `${provider} rejected its Worker API key. Replace the key in the kenai Worker's Secrets.` : status === 402 ? `${provider} requires account credit or billing. Check the provider account.` : status === 403 ? `${provider} denied access. Check the API key permissions, account and region restrictions.` : status === 429 ? `${provider} rate limit reached. Try later.` : `${provider} is unavailable. Try later.`;
      failure = new HttpError(status === 429 ? 429 : 503, code, message, status);
      continue;
    }
    if (streaming) {
      if (!upstream.body || !upstream.headers.get("Content-Type")?.includes("text/event-stream")) {
        await upstream.body?.cancel();
        throw new HttpError(502, "bad_upstream_output", "The provider did not return an event stream.");
      }
      return new Response(upstream.body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    }
    let payload;
    try {
      payload = await upstream.json();
    } catch {
      throw new HttpError(502, "bad_upstream_output", "The provider returned invalid JSON.");
    }
    if (!payload || !(nativeGemini ? Array.isArray(payload.candidates) || Boolean(payload.promptFeedback) : Array.isArray(body ? payload.choices : payload.data))) {
      throw new HttpError(502, "bad_upstream_output", "The provider returned an invalid response.");
    }
    return Response.json(payload);
  }
  throw failure;
}
__name(vendorRequest, "vendorRequest");
async function legacyCompletion(request, env) {
  const body = await readJson(request);
  const content = body.content ?? body.prompt;
  const hint = request.headers.get("X-Model") ?? "text";
  const vision = Array.isArray(content) || hint.toLowerCase() === "llama";
  const selected = body.model ?? (hint.startsWith("@cf/") ? hint : void 0);
  const messages = [{ role: "user", content: messageText(content, vision) }];
  const hops = selected ? [{ provider: body.provider === "gemini" || body.provider === "groq" || body.provider === "cerebras" || body.provider === "deepseek" ? body.provider : "cloudflare", model: String(selected) }] : vision ? [{ provider: "cloudflare", model: CLOUDFLARE_VISION_MODEL_ID }] : [
    { provider: "cerebras", model: DEFAULT_CEREBRAS_MODEL_ID },
    { provider: "groq", model: DEFAULT_GROQ_MODEL_ID },
    { provider: "deepseek", model: DEFAULT_DEEPSEEK_MODEL_ID },
    { provider: "cloudflare", model: DEFAULT_CLOUDFLARE_MODEL_ID }
  ];
  let lastError;
  for (const hop of hops) {
    try {
      const input = { model: hop.model, messages, max_tokens: 1024 };
      const response = hop.provider === "cloudflare" ? await chatCompletions(new Request(request.url, { method: "POST", body: JSON.stringify(input) }), env) : await vendorRequest(request, env, hop.provider, "chat/completions", input);
      const completion = await response.json();
      const answer = completion.choices?.[0]?.message?.content;
      if (!answer?.trim()) throw new HttpError(502, "bad_upstream_output", "The model returned no answer.");
      return Response.json({ answer, model: hop.model, provider: hop.provider });
    } catch (error) {
      if (selected || vision) throw error;
      lastError = error;
    }
  }
  throw lastError ?? new HttpError(503, "provider_unavailable", "All Ken AI models are unavailable. Try later.");
}
__name(legacyCompletion, "legacyCompletion");
var NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Ken AI</title>
<style>body{font-family:system-ui;background:#f8fafc;color:#334155;display:grid;place-items:center;min-height:90vh;text-align:center}a{color:#2563eb}</style>
</head><body><main><h1>Ken AI</h1><p>This address serves the Ken AI model API.</p>
<a href="https://ken-ai.tech">Open Ken AI</a></main></body></html>`;
var index_default = {
  async fetch(request, env) {
    const cors = new Headers({
      Vary: "Origin",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, X-API-Key, X-Model, Content-Type",
      "Access-Control-Max-Age": "86400"
    });
    const origin = request.headers.get("Origin");
    if (origin && (env.ALLOWED_ORIGINS ?? "https://ken-ai.tech,https://www.ken-ai.tech").split(",").map((item) => item.trim()).includes(origin)) {
      cors.set("Access-Control-Allow-Origin", origin);
    }
    const withCors = /* @__PURE__ */ __name((response) => {
      const headers = new Headers(response.headers);
      cors.forEach((value, name) => headers.set(name, value));
      return new Response(response.body, { status: response.status, headers });
    }, "withCors");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const { pathname } = new URL(request.url);
      if (pathname === "/health" && request.method === "GET") {
        return withCors(Response.json(
          { ok: Boolean(env.KEN_API_KEY && env.AI), service: "kenai", name: "Ken AI" },
          { status: env.KEN_API_KEY && env.AI ? 200 : 503 }
        ));
      }
      if (pathname === "/" && request.method === "GET") {
        return withCors(new Response(NOT_FOUND_HTML, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }));
      }
      if (!env.KEN_API_KEY) throw new HttpError(500, "not_configured", "Worker is not configured.");
      const provided = presentedKey(request);
      if (!provided || !await keyMatches(provided, env.KEN_API_KEY)) {
        throw new HttpError(401, "unauthorized", "Missing or invalid API key.");
      }
      if (pathname === "/" && request.method === "POST") return withCors(await legacyCompletion(request, env));
      const nativeRoute = pathname.match(/^\/providers\/gemini\/v1beta\/(models\/[A-Za-z0-9._-]{1,200}:(?:generateContent|streamGenerateContent))$/);
      if (nativeRoute) {
        if (request.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
        return withCors(await vendorRequest(request, env, "gemini", nativeRoute[1], await readJson(request, MAX_NATIVE_BODY_BYTES)));
      }
      const vendorRoute = pathname.match(/^\/providers\/(gemini|groq|cerebras|deepseek)\/v1\/(models|chat\/completions)$/);
      if (vendorRoute) {
        const operation = vendorRoute[2];
        if (request.method !== (operation === "models" ? "GET" : "POST")) {
          throw new HttpError(405, "method_not_allowed", operation === "models" ? "Use GET." : "Use POST.");
        }
        return withCors(await vendorRequest(
          request,
          env,
          vendorRoute[1],
          operation,
          operation === "models" ? void 0 : await readJson(request)
        ));
      }
      if (pathname === "/v1/models" && request.method === "GET") {
        return withCors(Response.json({
          object: "list",
          data: MODELS.map((model) => ({
            id: model.id,
            object: "model",
            owned_by: "cloudflare",
            name: model.name,
            capabilities: model.capabilities,
            context_window: model.contextWindow
          }))
        }));
      }
      if (pathname.startsWith("/ai/run/")) {
        if (request.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
        const model = pathname.slice("/ai/run/".length);
        if (!MODELS.some((item) => item.id === model && item.capabilities.includes("imageGeneration"))) {
          throw new HttpError(400, "unknown_model", "That image model is not available.");
        }
        const contentType = request.headers.get("Content-Type") ?? "";
        const bytes = await request.arrayBuffer();
        if (bytes.byteLength > MAX_BODY_BYTES) throw new HttpError(413, "too_large", "Request body is too large.");
        const input = contentType.startsWith("multipart/form-data") ? { multipart: { body: bytes, contentType } } : await readJson(new Request(request.url, { method: "POST", body: bytes }));
        const output = await runModel(env, model, input);
        if (output instanceof ReadableStream || output instanceof ArrayBuffer || output instanceof Uint8Array) {
          return withCors(new Response(output, { headers: { "Content-Type": "application/octet-stream" } }));
        }
        return withCors(Response.json({ success: true, result: output }));
      }
      if (pathname === "/v1/chat/completions") {
        if (request.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
        return withCors(await chatCompletions(request, env));
      }
      throw new HttpError(404, "not_found", "Not found.");
    } catch (error) {
      if (error instanceof HttpError) return withCors(errorResponse(error.status, error.code, error.message, error.upstreamStatus));
      console.error("unhandled worker error", error instanceof Error ? error.message : "unknown");
      return withCors(errorResponse(500, "internal_error", "Unexpected error."));
    }
  }
};
export {
  ALLOWED_MODELS,
  index_default as default,
  toOpenAIStream
};
//# sourceMappingURL=index.js.map
