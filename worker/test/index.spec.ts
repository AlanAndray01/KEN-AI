import { afterEach, describe, expect, it, vi } from "vitest";
import { CLOUDFLARE_MODELS, CLOUDFLARE_DISABLED_MODEL_IDS } from "../../shared/src/constants/cloudflareModels";
import worker, { ALLOWED_MODELS, type Env } from "../src/index";

const KEY = "test-secret";
const MODEL = ALLOWED_MODELS[0];
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function makeEnv(run: (model: string, input: unknown) => Promise<unknown> = async () => ({ response: "hi" })) {
	const ai = { run: vi.fn(run) };
	return { env: { AI: ai, KEN_API_KEY: KEY } as unknown as Env, ai };
}

function call(env: Env, path: string, init: RequestInit & { key?: string | null } = {}): Promise<Response> {
	const { key = KEY, headers, ...rest } = init;
	return worker.fetch(
		new Request(`https://worker.test${path}`, {
			...rest,
			headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}), ...headers },
		}) as never,
		env,
		{} as never,
	);
}

const chat = (body: unknown, key?: string | null) =>
	({ method: "POST", body: JSON.stringify(body), ...(key !== undefined ? { key } : {}) }) satisfies RequestInit;

function sse(lines: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const line of lines) controller.enqueue(encoder.encode(line));
			controller.close();
		},
	});
}

describe("authentication", () => {
	it("rejects missing and wrong keys without calling the model", async () => {
		const { env, ai } = makeEnv();
		const body = { model: MODEL, messages: [{ role: "user", content: "hi" }] };
		expect((await call(env, "/v1/chat/completions", chat(body, null))).status).toBe(401);
		expect((await call(env, "/v1/chat/completions", chat(body, "wrong"))).status).toBe(401);
		expect(ai.run).not.toHaveBeenCalled();
	});

	it("accepts X-API-Key as well as a bearer token", async () => {
		const { env } = makeEnv();
		const response = await call(env, "/v1/models", { key: null, headers: { "X-API-Key": KEY } });
		expect(response.status).toBe(200);
	});

	it("fails closed when no secret is configured", async () => {
		const { env } = makeEnv();
		const response = await call({ ...env, KEN_API_KEY: undefined } as Env, "/v1/models");
		expect(response.status).toBe(500);
	});
});

describe("models", () => {
	it("lists only the allow-list", async () => {
		const { env } = makeEnv();
		const body = (await (await call(env, "/v1/models")).json()) as { data: { id: string }[] };
		expect(body.data.map((item) => item.id)).toEqual(CLOUDFLARE_MODELS.filter((item) =>
		!CLOUDFLARE_DISABLED_MODEL_IDS.includes(item.id)).map((item) => item.id));
	});

	it("rejects a model that is not allowed, before running anything", async () => {
		const { env, ai } = makeEnv();
		const response = await call(env, "/v1/chat/completions", chat({ model: "@cf/some/expensive", messages: [{ role: "user", content: "x" }] }));
		expect(response.status).toBe(400);
		expect(ai.run).not.toHaveBeenCalled();
	});
});

describe("validation", () => {
	it.each([
		["no messages", { model: MODEL }],
		["empty messages", { model: MODEL, messages: [] }],
		["bad role", { model: MODEL, messages: [{ role: "hacker", content: "x" }] }],
		["non-string content", { model: MODEL, messages: [{ role: "user", content: 5 }] }],
		["image part", { model: MODEL, messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "x" } }] }] }],
	])("returns 400 for %s", async (_name, body) => {
		const { env, ai } = makeEnv();
		expect((await call(env, "/v1/chat/completions", chat(body))).status).toBe(400);
		expect(ai.run).not.toHaveBeenCalled();
	});

	it("rejects an oversized body", async () => {
		const { env } = makeEnv();
		const big = "x".repeat(1_100_000);
		const response = await call(env, "/v1/chat/completions", chat({ model: MODEL, messages: [{ role: "user", content: big }] }));
		expect(response.status).toBe(413);
	});

	it("keeps system messages and history, and caps output tokens", async () => {
		const { env, ai } = makeEnv();
		await call(
			env,
			"/v1/chat/completions",
			chat({
				model: MODEL,
				max_tokens: 999_999,
				messages: [
					{ role: "system", content: "be brief" },
					{ role: "user", content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] },
					{ role: "assistant", content: "ok" },
					{ role: "user", content: "again" },
				],
			}),
		);
		expect(ai.run).toHaveBeenCalledWith(
			MODEL,
			expect.objectContaining({
				max_tokens: 16_384,
				messages: [
					{ role: "system", content: "be brief" },
					{ role: "user", content: "a\nb" },
					{ role: "assistant", content: "ok" },
					{ role: "user", content: "again" },
				],
			}),
		);
	});
});

describe("non-streaming responses", () => {
	const request = chat({ model: MODEL, messages: [{ role: "user", content: "hi" }] });

	it("wraps native { response } output", async () => {
		const { env } = makeEnv(async () => ({ response: "hello" }));
		const body = (await (await call(env, "/v1/chat/completions", request)).json()) as { choices: { message: { content: string } }[] };
		expect(body.choices[0]?.message.content).toBe("hello");
	});

	it("passes OpenAI-shaped output through", async () => {
		const choices = [{ index: 0, message: { role: "assistant", content: "from choices" }, finish_reason: "stop" }];
		const { env } = makeEnv(async () => ({ choices, usage: { prompt_tokens: 1, completion_tokens: 2 } }));
		const body = (await (await call(env, "/v1/chat/completions", request)).json()) as { choices: unknown; usage: unknown };
		expect(body.choices).toEqual(choices);
		expect(body.usage).toEqual({ prompt_tokens: 1, completion_tokens: 2 });
	});

	it("returns 502, not an empty answer, for an unrecognised output", async () => {
		const { env } = makeEnv(async () => ({ something: "else" }));
		expect((await call(env, "/v1/chat/completions", request)).status).toBe(502);
	});

	it("returns a safe 503 when the model call throws", async () => {
		const { env } = makeEnv(async () => {
			throw new Error("secret upstream detail");
		});
		const response = await call(env, "/v1/chat/completions", request);
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain("secret upstream detail");
	});
});

describe("streaming responses", () => {
	const request = chat({ model: MODEL, stream: true, messages: [{ role: "user", content: "hi" }] });

	it("re-frames native chunks split across reads and ends with [DONE]", async () => {
		const { env } = makeEnv(async () =>
			sse(['data: {"response":"Hel', 'lo"}\n\ndata: {"response":" there"}\n\n', "data: [DONE]\n\n"]),
		);
		const response = await call(env, "/v1/chat/completions", request);
		expect(response.headers.get("Content-Type")).toBe("text/event-stream");
		const text = await response.text();
		expect(text).toContain('"content":"Hello"');
		expect(text).toContain('"content":" there"');
		expect(text.trimEnd().endsWith("data: [DONE]")).toBe(true);
	});

	it("passes OpenAI-shaped chunks through and adds [DONE] when upstream omits it", async () => {
		const { env } = makeEnv(async () => sse(['data: {"choices":[{"index":0,"delta":{"content":"x"}}]}\n\n']));
		const text = await (await call(env, "/v1/chat/completions", request)).text();
		expect(text).toContain('"content":"x"');
		expect(text.match(/\[DONE\]/g)).toHaveLength(1);
	});

	it("returns 502 when streaming was asked for but no stream came back", async () => {
		const { env } = makeEnv(async () => ({ response: "not a stream" }));
		expect((await call(env, "/v1/chat/completions", request)).status).toBe(502);
	});
});

describe("Ken AI Worker integration", () => {
	it("brands the pasted Worker's root page as Ken AI", async () => {
		const { env } = makeEnv();
		const response = await call(env, "/", { key: null });
		expect(response.status).toBe(404);
		const html = await response.text();
		expect(html).toContain("Ken AI");
		expect(html).not.toContain("creativetaleem");
	});

	it("adapts prompt/content without mislabelling Llama as Kimi", async () => {
		const { env } = makeEnv(async () => ({ response: "hello" }));
		const response = await call(env, "/", chat({ prompt: "hi", model: MODEL }));
		expect(await response.json()).toEqual({ answer: "hello", model: MODEL, provider: "cloudflare" });
	});

	it("never supplies AI Gateway options, even with a leftover variable", async () => {
		const { env, ai } = makeEnv();
		await call({ ...env, AI_GATEWAY_ID: "old-gateway" } as Env, "/v1/chat/completions",
			chat({ model: MODEL, messages: [{ role: "user", content: "hi" }] }));
		expect(ai.run.mock.calls[0]).toHaveLength(2);
	});

	it("forwards inline vision images to the selected vision model", async () => {
		const model = CLOUDFLARE_MODELS.find((item) => item.capabilities.includes("vision"))!;
		const { env, ai } = makeEnv();
		const content = [{ type: "image_url", image_url: { url: "data:image/png;base64,aGk=" } }];
		expect((await call(env, "/v1/chat/completions", chat({ model: model.id,
			messages: [{ role: "user", content }] }))).status).toBe(200);
		expect(ai.run).toHaveBeenCalledWith(model.id, expect.objectContaining({ messages: [{ role: "user", content }] }));
	});

	it.each(["json", "bytes"])("serves image model %s output through the Worker", async (kind) => {
		const model = CLOUDFLARE_MODELS.find((item) => item.capabilities.includes("imageGeneration"))!;
		const { env, ai } = makeEnv(async () => kind === "json" ? { image: "aGk=" } : new Uint8Array([1, 2, 3]));
		const response = await call(env, `/ai/run/${model.id}`, chat({ prompt: "a cat" }));
		expect(response.status).toBe(200);
		expect(ai.run).toHaveBeenCalledWith(model.id, { prompt: "a cat" });
		if (kind === "json") expect(await response.json()).toEqual({ success: true, result: { image: "aGk=" } });
		else expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
	});
});

describe("official vendor proxies", () => {
	it.each([
		["gemini", "GEMINI_KEYS", "https://generativelanguage.googleapis.com/v1beta/openai"],
		["groq", "GROQ_KEYS", "https://api.groq.com/openai/v1"],
		["cerebras", "CEREBRAS_KEYS", "https://api.cerebras.ai/v1"],
		["deepseek", "DEEPSEEK_API_KEY", "https://api.deepseek.com/v1"],
	])("routes %s history and parameters using only its vendor key", async (provider, keyName, base) => {
		const { env } = makeEnv();
		const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: "hello" } }] }));
		vi.stubGlobal("fetch", fetchMock);
		const messages = [{ role: "system", content: "Ken AI" }, { role: "user", content: "hi" }];
		const response = await call({ ...env, [keyName]: "vendor-secret" }, `/providers/${provider}/v1/chat/completions`,
			chat({ model: "vendor-model", messages, temperature: 0.2, tools: [{ type: "function" }] }));
		expect(response.status).toBe(200);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(`${base}/chat/completions`);
		expect(new Headers(init.headers).get("Authorization")).toBe("Bearer vendor-secret");
		expect(new Headers(init.headers).has("cf-aig-authorization")).toBe(false);
		expect(JSON.parse(String(init.body))).toMatchObject({ messages, temperature: 0.2, tools: [{ type: "function" }] });
	});

	it("rejects unauthenticated proxy calls before contacting any vendor", async () => {
		const { env } = makeEnv();
		const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
		expect((await call({ ...env, GROQ_KEYS: "vendor" }, "/providers/groq/v1/models", { key: null })).status).toBe(401);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns 503 when a vendor secret is missing", async () => {
		const { env } = makeEnv();
		const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
		expect((await call(env, "/providers/groq/v1/models")).status).toBe(503);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("retrieves vendor model IDs through the authenticated Worker", async () => {
		const { env } = makeEnv();
		vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [{ id: "m" }] })));
		expect(await (await call({ ...env, GROQ_KEYS: "vendor" }, "/providers/groq/v1/models")).json()).toEqual({ data: [{ id: "m" }] });
	});

	it("constructs a vendor request using the real Workers Request API", async () => {
		const { env } = makeEnv();
		vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
			// Keep runtime request validation even though the upstream response is fake.
			const outbound = new Request(url, init);
			expect(outbound.redirect).toBe("manual");
			return Response.json({ data: [{ id: "m" }] });
		}));
		const response = await call({ ...env, GROQ_KEYS: "vendor" }, "/providers/groq/v1/models");
		expect(response.status).toBe(200);
	});

	it("rejects redirects without sending provider secrets to the redirect destination", async () => {
		const { env } = makeEnv();
		const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { Location: "https://untrusted.example" } }));
		vi.stubGlobal("fetch", fetchMock);
		const response = await call({ ...env, GROQ_KEYS: "vendor" }, "/providers/groq/v1/models");
		expect(await response.json()).toMatchObject({ error: { code: "provider_redirect", upstreamStatus: 302 } });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("preserves the pasted automatic fallback when the first vendor model is rejected", async () => {
		const { env } = makeEnv();
		const fetchMock = vi.fn().mockResolvedValueOnce(new Response("retired model", { status: 404 }))
			.mockResolvedValueOnce(Response.json({ choices: [{ message: { content: "from Groq" } }] }));
		vi.stubGlobal("fetch", fetchMock);
		const response = await call({ ...env, CEREBRAS_KEYS: "cerebras", GROQ_KEYS: "groq" }, "/", chat({ prompt: "hi" }));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ answer: "from Groq", provider: "groq" });
		expect(fetchMock.mock.calls[1][0]).toBe("https://api.groq.com/openai/v1/chat/completions");
	});

	it("tries another pool key after 429 while preserving the selected model", async () => {
		const { env } = makeEnv();
		const fetchMock = vi.fn().mockResolvedValueOnce(new Response("private quota details", { status: 429 }))
			.mockResolvedValueOnce(Response.json({ choices: [{ message: { content: "hi" } }] }));
		vi.stubGlobal("fetch", fetchMock);
		const response = await call({ ...env, GROQ_KEYS: "a,b" }, "/providers/groq/v1/chat/completions",
			chat({ model: "chosen", messages: [{ role: "user", content: "hi" }] }));
		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		for (const [, init] of fetchMock.mock.calls) expect(JSON.parse(init.body).model).toBe("chosen");
		const used = fetchMock.mock.calls.map(([, init]) => new Headers(init.headers).get("Authorization"));
		expect(new Set(used).size).toBe(2);
	});

	it("passes vendor SSE through with DONE", async () => {
		const { env } = makeEnv();
		const wire = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n';
		vi.stubGlobal("fetch", vi.fn(async () => new Response(wire, { headers: { "Content-Type": "text/event-stream" } })));
		const response = await call({ ...env, DEEPSEEK_API_KEY: "vendor" }, "/providers/deepseek/v1/chat/completions",
			chat({ model: "deepseek-chat", messages: [{ role: "user", content: "hi" }], stream: true }));
		expect(response.headers.get("Content-Type")).toBe("text/event-stream");
		expect(await response.text()).toBe(wire);
	});

	it("does not expose upstream errors or keys", async () => {
		const { env } = makeEnv();
		vi.stubGlobal("fetch", vi.fn(async () => new Response("vendor-secret private trace", { status: 401 })));
		const response = await call({ ...env, GROQ_KEYS: "vendor-secret" }, "/providers/groq/v1/models");
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain("vendor-secret");
	});

	it.each([[401, "provider_invalid_credentials"], [402, "provider_billing_required"],
		[403, "provider_access_denied"], [429, "rate_limit_exceeded"], [500, "provider_unavailable"]])(
		"identifies upstream %s without exposing its body or confusing Worker authentication", async (status, code) => {
			const { env } = makeEnv();
			vi.stubGlobal("fetch", vi.fn(async () => new Response("vendor-secret private trace", { status: Number(status) })));
			const response = await call({ ...env, GEMINI_KEYS: "vendor-secret" }, "/providers/gemini/v1/models");
			expect(response.status).toBe(status === 429 ? 429 : 503);
			const body = await response.json() as { error: { code: string; upstreamStatus: number } };
			expect(body.error).toMatchObject({ code, upstreamStatus: status });
			expect(JSON.stringify(body)).not.toMatch(/vendor-secret|private trace/);
		});

	it("distinguishes an unreachable provider from rejected credentials", async () => {
		const { env } = makeEnv();
		vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("private network details"); }));
		const response = await call({ ...env, GROQ_KEYS: "vendor-secret" }, "/providers/groq/v1/models");
		expect(await response.json()).toMatchObject({ error: { code: "provider_network_error" } });
	});

	it("proxies native Gemini contents and swaps the shared secret for a Google key", async () => {
		const { env } = makeEnv();
		const fetchMock = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: "summary" }] } }] }));
		vi.stubGlobal("fetch", fetchMock);
		const contents = [{ role: "user", parts: [{ inlineData: { mimeType: "application/pdf", data: "JVBER" } }] }];
		const response = await call({ ...env, GEMINI_KEYS: "google-secret" }, "/providers/gemini/v1beta/models/gemini-test:generateContent", chat({ contents }));
		expect(response.status).toBe(200);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
		expect(new Headers(init.headers).get("x-goog-api-key")).toBe("google-secret");
		expect(new Headers(init.headers).has("Authorization")).toBe(false);
		expect(JSON.parse(String(init.body)).contents).toEqual(contents);
	});

	it("proxies native Gemini streaming with the fixed SSE query", async () => {
		const { env } = makeEnv();
		const wire = 'data: {"candidates":[{"content":{"parts":[{"text":"hi"}]}}]}\n\n';
		const fetchMock = vi.fn(async () => new Response(wire, { headers: { "Content-Type": "text/event-stream" } }));
		vi.stubGlobal("fetch", fetchMock);
		const response = await call({ ...env, GEMINI_KEYS: "google" }, "/providers/gemini/v1beta/models/gemini-test:streamGenerateContent",
			chat({ contents: [{ role: "user", parts: [{ text: "hi" }] }] }));
		expect(await response.text()).toBe(wire);
		expect(fetchMock.mock.calls[0][0]).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test:streamGenerateContent?alt=sse");
	});

	it("accepts native image responses and GEMINI_API_KEY as an alias", async () => {
		const { env } = makeEnv();
		vi.stubGlobal("fetch", vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "aGk=" } }] } }] })));
		const response = await call({ ...env, GEMINI_API_KEY: "google" }, "/providers/gemini/v1beta/models/gemini-image:generateContent",
			chat({ contents: [{ parts: [{ text: "a cat" }] }], generationConfig: { responseModalities: ["IMAGE"] } }));
		expect(response.status).toBe(200);
		expect(JSON.stringify(await response.json())).toContain("inlineData");
	});

	it("rejects malformed native bodies and unsupported Gemini operations", async () => {
		const { env } = makeEnv();
		const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
		expect((await call({ ...env, GEMINI_KEYS: "google" }, "/providers/gemini/v1beta/models/gemini-test:generateContent", chat({ contents: [] }))).status).toBe(400);
		expect((await call({ ...env, GEMINI_KEYS: "google" }, "/providers/gemini/v1beta/models/gemini-test:delete", chat({}))).status).toBe(404);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
