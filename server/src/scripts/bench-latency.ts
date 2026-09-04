/**
 * Chat latency harness.
 *
 * Separates the three costs that add up to "the reply took ten seconds", so a
 * regression can be attributed instead of guessed at:
 *
 *   groq  - the provider floor. Streams the exact prompt the chat path builds,
 *           straight to Groq, with no Express and no Mongo in the way.
 *   mongo - the round-trip cost of the reads the request path performs before
 *           the provider is called. This is the number that made the pipeline
 *           slow, so it is measured directly rather than inferred.
 *   api   - the number the user actually feels: POST to the real SSE endpoint
 *           through auth, rate limiting and persistence.
 *
 * Time-to-first-token is the headline metric. Total completion time is bounded
 * by how many tokens the model has to generate and is not a latency bug.
 *
 * Usage:
 *   npm run bench:groq
 *   npm run bench:mongo
 *   npm run bench:api     (needs BENCH_EMAIL and BENCH_PASSWORD)
 */
import { performance } from "node:perf_hooks";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import { getEnvApiKey } from "../services/ai/credentials.js";
import { modelRegistry } from "../services/ai/ModelRegistry.js";
import { buildResponsePolicyMessages } from "../services/chat/responsePolicy.js";
import { contextManager } from "../services/chat/ContextManager.js";
import { iterateSseData } from "../utils/sse.js";
import { DEFAULT_GROQ_MODEL_ID, createReasoningFilter } from "@Ken/shared";
import { buildCompatibleChatBody } from "../services/ai/providers/groqChatBody.js";

interface Sample {
  ttfbMs: number;
  ttftMs: number;
  totalMs: number;
  chars: number;
  note?: string;
}

const PROMPT = process.env.BENCH_PROMPT ?? "Explain what an index does in MongoDB.";
const RUNS = Number(process.env.BENCH_RUNS ?? 5);
const MODEL = process.env.BENCH_MODEL ?? DEFAULT_GROQ_MODEL_ID;
const API_BASE = process.env.BENCH_API_BASE ?? `http://127.0.0.1:${env.PORT}/api`;

function percentile(values: number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index] ?? Number.NaN;
}

function summarize(label: string, samples: Sample[]): void {
  if (samples.length === 0) {
    process.stdout.write(`\n${label}: no samples\n`);
    return;
  }
  const rows: Array<[string, number[]]> = [
    ["time-to-first-byte", samples.map((s) => s.ttfbMs)],
    ["time-to-first-token", samples.map((s) => s.ttftMs)],
    ["total completion", samples.map((s) => s.totalMs)],
  ];
  process.stdout.write(`\n=== ${label} (n=${samples.length}, model=${MODEL}) ===\n`);
  for (const [name, values] of rows) {
    const finite = values.filter((value) => Number.isFinite(value));
    if (finite.length === 0) continue;
    const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
    process.stdout.write(
      `${name.padEnd(22)} min ${fmt(Math.min(...finite))}  median ${fmt(percentile(finite, 50))}` +
        `  p95 ${fmt(percentile(finite, 95))}  mean ${fmt(mean)}\n`,
    );
  }
  const chars = samples.map((s) => s.chars);
  process.stdout.write(`reply length           mean ${Math.round(chars.reduce((a, b) => a + b, 0) / chars.length)} chars\n`);
}

function fmt(ms: number): string {
  return `${ms.toFixed(0).padStart(6)}ms`;
}

/** The exact system + user prompt the chat path sends, so token counts match production. */
function buildRealPrompt(): Array<{ role: string; content: string }> {
  const messages = contextManager.build({
    messages: [...buildResponsePolicyMessages(PROMPT), { role: "user", content: PROMPT }],
    modelId: MODEL,
    providerId: "groq",
  });
  return messages.map((message) => ({ role: message.role, content: message.content }));
}

async function streamGroq(apiKey: string, body: Record<string, unknown>): Promise<Sample> {
  const started = performance.now();
  let ttfb = Number.NaN;
  let ttft = Number.NaN;
  let chars = 0;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  ttfb = performance.now() - started;
  if (!response.ok) {
    throw new Error(`provider returned ${response.status}`);
  }

  const reasoningFilter = createReasoningFilter();
  for await (const payload of iterateSseData(response)) {
    let raw = "";
    try {
      const parsed = JSON.parse(payload) as {
        choices?: Array<{ delta?: { content?: string; reasoning_content?: string; reasoning?: string } }>;
      };
      raw = parsed.choices?.[0]?.delta?.content ?? "";
    } catch {
      continue;
    }
    // Match the chat path: hidden chain-of-thought is not a visible token.
    const text = raw ? reasoningFilter.push(raw).visible : "";
    if (!text) continue;
    if (!Number.isFinite(ttft)) ttft = performance.now() - started;
    chars += text.length;
  }
  const tail = reasoningFilter.flush().visible;
  if (tail) {
    if (!Number.isFinite(ttft)) ttft = performance.now() - started;
    chars += tail.length;
  }

  return { ttfbMs: ttfb, ttftMs: ttft, totalMs: performance.now() - started, chars };
}

async function benchGroqSeries(
  apiKey: string,
  body: Record<string, unknown>,
  label: string,
): Promise<Sample[]> {
  const samples: Sample[] = [];
  process.stdout.write(`\n--- ${label} ---\n`);
  for (let run = 0; run < RUNS; run += 1) {
    if (run > 0) await new Promise((resolve) => setTimeout(resolve, 1_500));
    try {
      const sample = await streamGroq(apiKey, body);
      samples.push(sample);
      process.stdout.write(
        `  run ${run + 1}: ttfb ${sample.ttfbMs.toFixed(0)}ms  ttft ${sample.ttftMs.toFixed(0)}ms  total ${sample.totalMs.toFixed(0)}ms\n`,
      );
    } catch (error) {
      process.stderr.write(`run ${run + 1}: ${error instanceof Error ? error.message : "failed"}\n`);
    }
  }
  return samples;
}

/** Provider floor: no Express, no Mongo, no auth. */
async function benchGroq(): Promise<void> {
  const apiKey = getEnvApiKey("groq");
  if (!apiKey) {
    process.stderr.write("GROQ_API_KEY is not set; skipping provider probe\n");
    return;
  }
  const messages = buildRealPrompt();
  const promptChars = messages.reduce((sum, message) => sum + message.content.length, 0);
  process.stdout.write(`prompt: ${messages.length} messages, ${promptChars} chars (~${Math.round(promptChars / 4)} tokens)\n`);

  const before = await benchGroqSeries(apiKey, { model: MODEL, stream: true, messages }, "before: Groq defaults (medium reasoning, no cap)");
  summarize("groq direct — before", before);

  await new Promise((resolve) => setTimeout(resolve, 8_000));

  const afterBody = buildCompatibleChatBody(
    {
      providerId: "groq",
      modelId: MODEL,
      messages: messages.map((message) => ({
        role: message.role as "user" | "system" | "assistant",
        content: message.content,
      })),
    },
    { stream: true, providerId: "groq" },
  );
  const after = await benchGroqSeries(apiKey, afterBody, "after: reasoning_effort=low + completion cap");
  summarize("groq direct — after (what Ken now sends)", after);
}

/**
 * Cost of the database work the request path does before Groq is reached.
 *
 * `assertModelAvailable` is timed on its own because prepare() still calls it
 * once per send, and it fans out into one query per configured provider.
 */
async function benchMongo(): Promise<void> {
  await connectDatabase();
  const mongoose = (await import("mongoose")).default;

  const pings: number[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now();
    await mongoose.connection.db?.admin().ping();
    pings.push(performance.now() - started);
  }
  const meanPing = pings.reduce((a, b) => a + b, 0) / pings.length;
  process.stdout.write(
    `\n=== mongo round trip (n=${pings.length}) ===\n` +
      `ping                   min ${fmt(Math.min(...pings))}  median ${fmt(percentile(pings, 50))}  mean ${fmt(meanPing)}\n`,
  );

  // Timed with and without a userId: passing one adds a per-provider
  // UserProviderCredential lookup, which is what the chat path actually does.
  const { User } = await import("../models/User.js");
  const someUser = await User.findOne({}).select("_id");
  const userId = someUser ? String(someUser._id) : undefined;

  const meanRegistry = await timeRegistry(undefined, "assertModelAvailable (no user)");
  const meanRegistryUser = userId
    ? await timeRegistry(userId, "assertModelAvailable (with user)")
    : meanRegistry;

  process.stdout.write(
    `\nthe chat path calls assertModelAvailable once per send, with a userId:\n` +
      `  estimated pre-provider database cost: ${meanRegistryUser.toFixed(0)}ms\n`,
  );

  await disconnectDatabase();
}

async function timeRegistry(userId: string | undefined, label: string): Promise<number> {
  const timings: number[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now();
    try {
      await modelRegistry.assertModelAvailable("groq", MODEL, userId);
    } catch {
      // Availability is irrelevant here; the query fan-out is what is being timed.
    }
    timings.push(performance.now() - started);
  }
  const mean = timings.reduce((a, b) => a + b, 0) / timings.length;
  process.stdout.write(
    `${label.padEnd(34)} min ${fmt(Math.min(...timings))}  median ${fmt(percentile(timings, 50))}  mean ${fmt(mean)}\n`,
  );
  return mean;
}

/** End-to-end through the real SSE endpoint, including auth and persistence. */
async function benchApi(): Promise<Sample[]> {
  const email = process.env.BENCH_EMAIL;
  const password = process.env.BENCH_PASSWORD;
  if (!email || !password) {
    process.stderr.write("BENCH_EMAIL and BENCH_PASSWORD are required for the api probe; skipping\n");
    return [];
  }

  const login = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) {
    process.stderr.write(`login failed with ${login.status}; skipping api probe\n`);
    return [];
  }
  const cookie = (login.headers.getSetCookie?.() ?? [])
    .map((entry) => entry.split(";")[0])
    .filter((entry): entry is string => Boolean(entry))
    .join("; ");
  const loginBody = (await login.json()) as { accessToken?: string; tokens?: { accessToken?: string } };
  const accessToken = loginBody.accessToken ?? loginBody.tokens?.accessToken;

  const samples: Sample[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now();
    let ttfb = Number.NaN;
    let ttft = Number.NaN;
    let chars = 0;

    const response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ content: `${PROMPT} (run ${run + 1})`, providerId: "groq", modelId: MODEL }),
    });
    ttfb = performance.now() - started;
    if (!response.ok) {
      process.stderr.write(`run ${run + 1}: endpoint returned ${response.status}\n`);
      continue;
    }

    for await (const payload of iterateSseData(response)) {
      let event: { type?: string; text?: string } = {};
      try {
        event = JSON.parse(payload) as { type?: string; text?: string };
      } catch {
        continue;
      }
      if (event.type === "chunk" && event.text) {
        if (!Number.isFinite(ttft)) ttft = performance.now() - started;
        chars += event.text.length;
      }
    }

    const totalMs = performance.now() - started;
    samples.push({ ttfbMs: ttfb, ttftMs: ttft, totalMs, chars });
    process.stdout.write(`  run ${run + 1}: ttfb ${ttfb.toFixed(0)}ms  ttft ${ttft.toFixed(0)}ms  total ${totalMs.toFixed(0)}ms\n`);
  }
  return samples;
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "all";

  if (mode === "groq" || mode === "all") {
    await benchGroq();
  }
  if (mode === "mongo" || mode === "all") {
    await benchMongo();
  }
  if (mode === "api" || mode === "all") {
    summarize("api endpoint (what the user feels)", await benchApi());
  }
}

void main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "bench failed"}\n`);
    process.exit(1);
  },
);
