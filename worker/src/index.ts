/**
 * KEN AI Worker: an authenticated, OpenAI-compatible front for Workers AI.
 *
 * Only the KEN AI Express server calls this. It authenticates with a shared
 * secret (KEN_API_KEY); no secret ever reaches a browser. Users, quotas and
 * chat history stay in Express.
 *
 *   GET  /v1/models            -> Cloudflare chat/image models
 *   POST /v1/chat/completions  -> chat, optionally streamed (SSE)
 *   /providers/{gemini|groq|cerebras|deepseek}/v1/{models|chat/completions}
 *   /providers/gemini/v1beta/models/{id}:{generateContent|streamGenerateContent}
 *   POST /                    -> pasted Worker's prompt/content interface
 */

import { CLOUDFLARE_MODELS, CLOUDFLARE_DISABLED_MODEL_IDS } from "../../shared/src/constants/cloudflareModels.js";
import { CLOUDFLARE_VISION_MODEL_ID, DEFAULT_CLOUDFLARE_MODEL_ID,
 DEFAULT_CEREBRAS_MODEL_ID, DEFAULT_DEEPSEEK_MODEL_ID, DEFAULT_GROQ_MODEL_ID } from "../../shared/src/constants/index.js";

export interface Env {
	AI: Ai;
	/** `wrangler secret put KEN_API_KEY`. Must match the key Express sends. */
	KEN_API_KEY?: string;
	ALLOWED_ORIGINS?: string;
	GEMINI_KEYS?: string;
	GEMINI_API_KEY?: string;
	GROQ_KEYS?: string;
	GROQ_API_KEY?: string;
	GROQ_KEY?: string;
	CEREBRAS_KEYS?: string;
	CEREBRAS_API_KEY?: string;
	CEREBRAS_KEY?: string;
	DEEPSEEK_API_KEY?: string;
	DEEPSEEK_KEY?: string;
}

/**
 * Shared with Express. Chat uses /v1/chat/completions; images use /ai/run.
 * Account/model restrictions still apply even when a model is listed.
 */
const MODELS = CLOUDFLARE_MODELS.filter((model) => !CLOUDFLARE_DISABLED_MODEL_IDS.includes(model.id));
export const ALLOWED_MODELS = MODELS.filter((model) => model.capabilities.includes("text")).map((model) => model.id);

const MAX_BODY_BYTES = 1_000_000;
// Allow a normal 10 MiB application upload encoded as native Gemini inlineData.
const MAX_NATIVE_BODY_BYTES = 16_000_000;
const MAX_MESSAGES = 200;
const DEFAULT_MAX_TOKENS = 4096;
const MAX_OUTPUT_TOKENS = 16_384;
const ROLES = new Set(["system", "user", "assistant", "tool"]);

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type ChatMessage = { role: string; content: string | ContentPart[] };

class HttpError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly upstreamStatus?: number,
	) {
		super(message);
	}
}

function errorResponse(status: number, code: string, message: string, upstreamStatus?: number): Response {
	return Response.json({ error: { code, message, ...(upstreamStatus !== undefined ? { upstreamStatus } : {}) } }, { status,
		headers: code === "quota_exceeded" ? { "Retry-After": String(Math.ceil((Date.UTC(
			new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1) - Date.now()) / 1000)) } : {} });
}

function mapAiError(error: unknown): HttpError {
	const raw = error as { code?: string | number; message?: string } | null;
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

async function runModel(env: Env, model: string, input: unknown): Promise<unknown> {
	try {
		return await (env.AI as unknown as { run(model: string, input: unknown, options?: unknown): Promise<unknown> })
			.run(model, input);
	} catch (error) {
		const mapped = mapAiError(error);
		console.error("workers-ai failed", { model, code: mapped.code });
		throw mapped;
	}
}

async function digest(value: string): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

/** Constant-time comparison on fixed-length digests, so neither content nor length leaks. */
async function keyMatches(provided: string, expected: string): Promise<boolean> {
	const [a, b] = await Promise.all([digest(provided), digest(expected)]);
	return crypto.subtle.timingSafeEqual(a, b);
}

function presentedKey(request: Request): string {
	const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
	return bearer ?? request.headers.get("X-API-Key") ?? "";
}

/** Text parts are joined; anything else (images, files) is refused rather than silently dropped. */
function messageText(content: unknown, vision: boolean): string | ContentPart[] {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		const parts: ContentPart[] = [];
		for (const part of content) {
			const item = part as { type?: unknown; text?: unknown; image_url?: { url?: unknown } };
			if (item?.type === "text" && typeof item.text === "string") parts.push({ type: "text", text: item.text });
			else if (vision && item?.type === "image_url" && typeof item.image_url?.url === "string" &&
				/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(item.image_url.url)) {
				// Only inline images: the Worker never fetches caller-selected URLs.
				parts.push({ type: "image_url", image_url: { url: item.image_url.url } });
			} else throw new HttpError(400, "unsupported_content", "Use text, or an inline PNG/JPEG/WebP image with a vision model.");
		}
		return parts.some((part) => part.type === "image_url") ? parts : parts.map((part) => (part as { text: string }).text).join("\n");
	}
	throw new HttpError(400, "invalid_request", "Each message needs string content.");
}

function parseMessages(value: unknown, vision: boolean): ChatMessage[] {
	if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
		throw new HttpError(400, "invalid_request", `messages must be an array of 1-${MAX_MESSAGES} items.`);
	}
	return value.map((raw) => {
		const message = raw as { role?: unknown; content?: unknown };
		if (typeof message?.role !== "string" || !ROLES.has(message.role)) {
			throw new HttpError(400, "invalid_request", "Each message needs a valid role.");
		}
		return { role: message.role, content: messageText(message.content, vision) };
	});
}

function numberOrUndefined(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function readJson(request: Request, maxBytes = MAX_BODY_BYTES): Promise<Record<string, unknown>> {
	const declared = Number(request.headers.get("Content-Length") ?? 0);
	if (declared > maxBytes) throw new HttpError(413, "too_large", "Request body is too large.");
	const text = await request.text();
	if (new TextEncoder().encode(text).byteLength > maxBytes) throw new HttpError(413, "too_large", "Request body is too large.");
	try {
		const parsed: unknown = JSON.parse(text);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
	} catch {
		// fall through to the shared error
	}
	throw new HttpError(400, "invalid_request", "Body must be a JSON object.");
}

/**
 * Newer Workers AI models answer in OpenAI shape (`choices`), older ones in
 * `{ response }`. Both are normalised; anything else is a loud 502, not an
 * empty answer.
 */
function normaliseCompletion(output: unknown, model: string): Record<string, unknown> {
	const out = output as { response?: unknown; choices?: unknown; usage?: unknown } | null;
	const base = { object: "chat.completion", model, created: Math.floor(Date.now() / 1000) };
	if (Array.isArray(out?.choices)) {
		const first = out.choices[0] as { message?: { content?: unknown } } | undefined;
		if (typeof first?.message?.content !== "string" || !first.message.content.trim()) {
			throw new HttpError(502, "bad_upstream_output", "The model returned no answer.");
		}
		return { ...base, choices: out.choices, ...(out.usage ? { usage: out.usage } : {}) };
	}
	if (typeof out?.response === "string" && out.response.trim()) {
		return {
			...base,
			choices: [{ index: 0, message: { role: "assistant", content: out.response }, finish_reason: "stop" }],
			...(out.usage ? { usage: out.usage } : {}),
		};
	}
	throw new HttpError(502, "bad_upstream_output", "The model returned an unrecognised response.");
}

function sseChunk(payload: unknown): Uint8Array {
	return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/** Re-frames Workers AI streaming output as OpenAI-style SSE and always ends with [DONE]. */
export function toOpenAIStream(stream: ReadableStream<Uint8Array>, model: string): ReadableStream<Uint8Array> {
	const decoder = new TextDecoder();
	const done = new TextEncoder().encode("data: [DONE]\n\n");
	let buffer = "";
	let finished = false;

	const handleLine = (line: string, controller: TransformStreamDefaultController<Uint8Array>): void => {
		if (!line.startsWith("data:")) return;
		const data = line.slice(5).trim();
		if (data === "[DONE]") {
			if (!finished) controller.enqueue(done);
			finished = true;
			return;
		}
		if (finished) return;
		let parsed: { response?: unknown; choices?: unknown; usage?: unknown; error?: unknown; errors?: unknown[] };
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
					choices: [{ index: 0, delta: { content: parsed.response } }],
				}),
			);
		} else if (parsed.usage) {
			controller.enqueue(sseChunk({ object: "chat.completion.chunk", model, choices: [], usage: parsed.usage }));
		}
	};

	return stream.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				buffer += decoder.decode(chunk, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) handleLine(line.trim(), controller);
			},
			flush(controller) {
				if (buffer.trim()) handleLine(buffer.trim(), controller);
				if (!finished) controller.enqueue(done);
			},
		}),
	);
}

async function chatCompletions(request: Request, env: Env): Promise<Response> {
	const body = await readJson(request);
	const model = body["model"];
	if (typeof model !== "string" || !(ALLOWED_MODELS as readonly string[]).includes(model)) {
		throw new HttpError(400, "unknown_model", "That model is not available on this Worker.");
	}
	const info = MODELS.find((item) => item.id === model)!;
	const messages = parseMessages(body["messages"], info.capabilities.includes("vision"));
	const stream = body["stream"] === true;
	const maxTokens = Math.min(
		Math.max(Math.floor(numberOrUndefined(body["max_tokens"]) ?? DEFAULT_MAX_TOKENS), 1),
		MAX_OUTPUT_TOKENS,
	);
	const temperature = numberOrUndefined(body["temperature"]);
	const topP = numberOrUndefined(body["top_p"]);

	const input = {
		messages,
		max_tokens: maxTokens,
		stream,
		...(body["stream_options"] ? { stream_options: body["stream_options"] } : {}),
		...(temperature !== undefined ? { temperature } : {}),
		...(topP !== undefined ? { top_p: topP } : {}),
	};

	// Express owns visible fallback events and preserves a user's chosen model.
	const output = await runModel(env, model, input);

	if (stream) {
		if (!(output instanceof ReadableStream)) {
			throw new HttpError(502, "bad_upstream_output", "The model did not return a stream.");
		}
		return new Response(toOpenAIStream(output as ReadableStream<Uint8Array>, model), {
			headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
		});
	}
	return Response.json(normaliseCompletion(output, model));
}

type Vendor = "gemini" | "groq" | "cerebras" | "deepseek";
const VENDOR_BASES: Record<Vendor, string> = {
	gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
	groq: "https://api.groq.com/openai/v1",
	cerebras: "https://api.cerebras.ai/v1",
	deepseek: "https://api.deepseek.com/v1",
};
const keyCursor: Partial<Record<Vendor, number>> = {};

function vendorKeys(env: Env, provider: Vendor): string[] {
	const raw = provider === "gemini" ? [env.GEMINI_KEYS, env.GEMINI_API_KEY]
		: provider === "groq" ? [env.GROQ_KEYS, env.GROQ_API_KEY, env.GROQ_KEY]
		: provider === "cerebras" ? [env.CEREBRAS_KEYS, env.CEREBRAS_API_KEY, env.CEREBRAS_KEY]
		: [env.DEEPSEEK_API_KEY, env.DEEPSEEK_KEY];
	return [...new Set(raw.flatMap((value) => value?.split(",").map((key) => key.trim()).filter(Boolean) ?? []))];
}

/** Fixed official destinations; never forward the caller's shared secret. */
async function vendorRequest(request: Request, env: Env, provider: Vendor, operation: string,
	body?: Record<string, unknown>): Promise<Response> {
	const keys = vendorKeys(env, provider);
	if (!keys.length) throw new HttpError(503, "provider_not_configured", `Add the ${provider} API key to the Ken AI Worker's Secrets.`);
	const nativeGemini = provider === "gemini" && operation.startsWith("models/");
	const streaming = nativeGemini ? operation.endsWith(":streamGenerateContent") : body?.stream === true;
	if (nativeGemini) {
		if (!body || !Array.isArray(body.contents) || !body.contents.length || body.contents.length > MAX_MESSAGES) {
			throw new HttpError(400, "invalid_request", "Supply 1-200 Gemini contents.");
		}
		const config = body.generationConfig as Record<string, unknown> | undefined;
		if (config !== undefined && (!config || typeof config !== "object" || Array.isArray(config))) {
			throw new HttpError(400, "invalid_request", "generationConfig must be an object.");
		}
		body = { ...body, generationConfig: { ...config,
			maxOutputTokens: Math.min(MAX_OUTPUT_TOKENS, Math.max(1,
				Math.floor(numberOrUndefined(config?.maxOutputTokens) ?? DEFAULT_MAX_TOKENS))) } };
	}
	if (operation === "chat/completions") {
		if (!body || typeof body.model !== "string" || !body.model.trim() || body.model.length > 200 ||
			!Array.isArray(body.messages) || !body.messages.length || body.messages.length > MAX_MESSAGES) {
			throw new HttpError(400, "invalid_request", "Supply a model ID and 1-200 messages.");
		}
		// Preserve history, tool calls and vendor-specific reasoning parameters.
		const tokenField = body.max_completion_tokens !== undefined ? "max_completion_tokens" : "max_tokens";
		body = { ...body, [tokenField]: Math.min(MAX_OUTPUT_TOKENS,
			Math.max(1, Math.floor(numberOrUndefined(body[tokenField]) ?? DEFAULT_MAX_TOKENS))) };
	}
	const start = (keyCursor[provider] ?? 0) % keys.length;
	keyCursor[provider] = start + 1;
	const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]);
	let failure = new HttpError(503, "provider_unavailable", `${provider} is unavailable. Try another model.`);
	for (let offset = 0; offset < keys.length; offset++) {
		let upstream: Response;
		try {
			const url = nativeGemini ? `https://generativelanguage.googleapis.com/v1beta/${operation}${streaming ? "?alt=sse" : ""}`
				: `${VENDOR_BASES[provider]}/${operation}`;
			const key = keys[(start + offset) % keys.length];
			upstream = await fetch(url, {
				// workerd supports manual/follow only. Reject redirects explicitly below.
				method: body ? "POST" : "GET", redirect: "manual", signal,
				headers: { ...(nativeGemini ? { "x-goog-api-key": key } : { Authorization: `Bearer ${key}` }),
					"Content-Type": "application/json", Accept: streaming ? "text/event-stream" : "application/json" },
				...(body ? { body: JSON.stringify(body) } : {}),
			});
		} catch (error) {
			// Fixed classifications only: exception text can contain a vendor credential.
			const detail = error instanceof Error ? error.message : "";
			const cause = /redirect/i.test(detail) ? "redirect" : /header|ByteString|character/i.test(detail) ? "header"
				: /signal|abort/i.test(detail) ? "signal" : /dns|resolve/i.test(detail) ? "dns" : /tls|ssl|certificate/i.test(detail) ? "tls" : "network";
			console.warn("vendor_fetch_failed", { provider, cause });
			failure = new HttpError(503, signal.aborted ? "provider_timeout" : cause === "header" ? "provider_invalid_credentials" : "provider_network_error",
				signal.aborted ? `${provider} request timed out. Try later.` : `${provider} could not be reached from the Worker. Try later.`);
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
			const code = status === 401 ? "provider_invalid_credentials" : status === 402 ? "provider_billing_required"
				: status === 403 ? "provider_access_denied" : status === 429 ? "rate_limit_exceeded" : "provider_unavailable";
			const message = status === 401 ? `${provider} rejected its Worker API key. Replace the key in the kenai Worker's Secrets.`
				: status === 402 ? `${provider} requires account credit or billing. Check the provider account.`
				: status === 403 ? `${provider} denied access. Check the API key permissions, account and region restrictions.`
				: status === 429 ? `${provider} rate limit reached. Try later.` : `${provider} is unavailable. Try later.`;
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
		let payload: { data?: unknown; choices?: unknown; candidates?: unknown; promptFeedback?: unknown };
		try { payload = await upstream.json(); }
		catch { throw new HttpError(502, "bad_upstream_output", "The provider returned invalid JSON."); }
		if (!payload || !(nativeGemini ? Array.isArray(payload.candidates) || Boolean(payload.promptFeedback)
			: Array.isArray(body ? payload.choices : payload.data))) {
			throw new HttpError(502, "bad_upstream_output", "The provider returned an invalid response.");
		}
		return Response.json(payload);
	}
	throw failure;
}

/** Adapt the supplied prompt/content interface to Ken AI without renaming models. */
async function legacyCompletion(request: Request, env: Env): Promise<Response> {
	const body = await readJson(request);
	const content = body.content ?? body.prompt;
	const hint = request.headers.get("X-Model") ?? "text";
	const vision = Array.isArray(content) || hint.toLowerCase() === "llama";
	const selected = body.model ?? (hint.startsWith("@cf/") ? hint : undefined);
	const messages = [{ role: "user", content: messageText(content, vision) }];
	const hops: Array<{ provider: Vendor | "cloudflare"; model: string }> = selected
		? [{ provider: body.provider === "gemini" || body.provider === "groq" || body.provider === "cerebras" || body.provider === "deepseek" ? body.provider : "cloudflare", model: String(selected) }]
		: vision ? [{ provider: "cloudflare", model: CLOUDFLARE_VISION_MODEL_ID }]
		: [{ provider: "cerebras", model: DEFAULT_CEREBRAS_MODEL_ID },
			{ provider: "groq", model: DEFAULT_GROQ_MODEL_ID },
			{ provider: "deepseek", model: DEFAULT_DEEPSEEK_MODEL_ID },
			{ provider: "cloudflare", model: DEFAULT_CLOUDFLARE_MODEL_ID }];
	let lastError: unknown;
	for (const hop of hops) {
		try {
			const input = { model: hop.model, messages, max_tokens: 1024 };
			const response = hop.provider === "cloudflare"
				? await chatCompletions(new Request(request.url, { method: "POST", body: JSON.stringify(input) }), env)
				: await vendorRequest(request, env, hop.provider, "chat/completions", input);
			const completion = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
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

const NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Ken AI</title>
<style>body{font-family:system-ui;background:#f8fafc;color:#334155;display:grid;place-items:center;min-height:90vh;text-align:center}a{color:#2563eb}</style>
</head><body><main><h1>Ken AI</h1><p>This address serves the Ken AI model API.</p>
<a href="https://ken-ai.tech">Open Ken AI</a></main></body></html>`;

export default {
	async fetch(request, env): Promise<Response> {
		const cors = new Headers({ Vary: "Origin", "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Authorization, X-API-Key, X-Model, Content-Type", "Access-Control-Max-Age": "86400" });
		const origin = request.headers.get("Origin");
		if (origin && (env.ALLOWED_ORIGINS ?? "https://ken-ai.tech,https://www.ken-ai.tech").split(",").map((item) => item.trim()).includes(origin)) {
			cors.set("Access-Control-Allow-Origin", origin);
		}
		const withCors = (response: Response): Response => {
			const headers = new Headers(response.headers);
			cors.forEach((value, name) => headers.set(name, value));
			return new Response(response.body, { status: response.status, headers });
		};
		if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
		try {
			const { pathname } = new URL(request.url);
			if (pathname === "/health" && request.method === "GET") {
				return withCors(Response.json({ ok: Boolean(env.KEN_API_KEY && env.AI), service: "kenai", name: "Ken AI" },
					{ status: env.KEN_API_KEY && env.AI ? 200 : 503 }));
			}
			if (pathname === "/" && request.method === "GET") {
				return withCors(new Response(NOT_FOUND_HTML, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }));
			}
			// Fail closed: with no secret configured nothing is served.
			if (!env.KEN_API_KEY) throw new HttpError(500, "not_configured", "Worker is not configured.");
			const provided = presentedKey(request);
			if (!provided || !(await keyMatches(provided, env.KEN_API_KEY))) {
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
				return withCors(await vendorRequest(request, env, vendorRoute[1] as Vendor, operation,
					operation === "models" ? undefined : await readJson(request)));
			}

			if (pathname === "/v1/models" && request.method === "GET") {
				return withCors(Response.json({
					object: "list",
					data: MODELS.map((model) => ({ id: model.id, object: "model", owned_by: "cloudflare", name: model.name,
						capabilities: model.capabilities, context_window: model.contextWindow })),
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
				const input = contentType.startsWith("multipart/form-data")
					? { multipart: { body: bytes, contentType } }
					: await readJson(new Request(request.url, { method: "POST", body: bytes }));
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
	},
} satisfies ExportedHandler<Env>;
