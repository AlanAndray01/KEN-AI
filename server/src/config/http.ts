import { createRequire } from "node:module";
import { logger } from "./logger.js";
import { toSafeError } from "../utils/redact.js";

/** Default undici keep-alive is 4s — chat turns are farther apart than that. */
const KEEP_ALIVE_MS = 60_000;

const GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/openai/models";

/**
 * Reuse TLS to Gemini/Groq across turns. A cold handshake from Render to
 * Google was ~1.5s of the production first-visible-chunk time.
 */
export function installProviderHttpKeepAlive(): void {
  try {
    // Resolve the npm package, not `node:undici` (that built-in is missing on
    // some Node builds and crashed boot with "No such built-in module").
    const require = createRequire(import.meta.url);
    const { Agent, setGlobalDispatcher } = require("undici") as {
      Agent: new (options: {
        keepAliveTimeout: number;
        keepAliveMaxTimeout: number;
        connections: number;
        pipelining: number;
      }) => unknown;
      setGlobalDispatcher: (dispatcher: unknown) => void;
    };
    setGlobalDispatcher(
      new Agent({
        keepAliveTimeout: KEEP_ALIVE_MS,
        keepAliveMaxTimeout: KEEP_ALIVE_MS,
        connections: 16,
        pipelining: 1,
      }),
    );
  } catch (error) {
    logger.warn({ err: toSafeError(error) }, "http keep-alive not installed");
  }
}

/** Open the Google socket after boot so the first chat is not a cold TLS. */
export async function warmupGeminiConnection(apiKey: string | undefined): Promise<void> {
  if (!apiKey) return;
  const started = Date.now();
  try {
    await fetch(GEMINI_MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });
    logger.info({ warmupMs: Date.now() - started }, "gemini connection warmed");
  } catch (error) {
    logger.warn({ warmupMs: Date.now() - started, err: toSafeError(error) }, "gemini warmup skipped");
  }
}
