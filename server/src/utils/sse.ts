import type { Response as ExpressResponse } from "express";

type FlushableResponse = ExpressResponse & {
  flush?: () => void;
};

export function writeSseHeaders(res: ExpressResponse): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.socket?.setNoDelay(true);
  res.flushHeaders?.();
  // Comment frame so proxies and Node flush the headers before the first token.
  res.write(":\n\n");
  flushSse(res);
}

export function writeSseEvent(
  res: ExpressResponse,
  event: string,
  data: unknown,
): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  flushSse(res);
}

export function writeSseDone(res: ExpressResponse): void {
  res.write("data: [DONE]\n\n");
  flushSse(res);
}

/** Visible in DevTools; no secrets, no prompt text. */
export interface SseTiming {
  type: "timing";
  requestId?: string;
  requestedModel: string;
  activeModel: string;
  fallbackFrom?: string;
  fallbackReason?: string;
  ttfbMs?: number;
  googleConnectMs?: number;
  firstVisibleChunkMs?: number;
  completeMs?: number;
}

export function buildSseTiming(fields: Omit<SseTiming, "type">): SseTiming {
  return { type: "timing", ...fields };
}

function flushSse(res: ExpressResponse): void {
  (res as FlushableResponse).flush?.();
}

/**
 * Yields JSON payloads from an upstream SSE, NDJSON, or JSON-array stream.
 * Gemini's streamGenerateContent uses CRLF SSE (`data: {...}\r\n\r\n`) when
 * `alt=sse` is honored, and a JSON array when it is not.
 */
export async function* iterateSseData(
  response: globalThis.Response,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const body = response.body;
  if (!body) return;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read();

      if (done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      buffer = normalizeNewlines(buffer);

      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        for (const payload of extractPayloads(part)) {
          yield payload;
        }
      }
    }

    buffer = normalizeNewlines(buffer);
    for (const payload of extractPayloads(buffer, { flush: true })) {
      yield payload;
    }
  } finally {
    reader.releaseLock();
  }
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function extractPayloads(block: string, options: { flush?: boolean } = {}): string[] {
  const trimmed = block.trim();
  if (!trimmed || trimmed === "[DONE]") return [];

  const sseData = readSseDataLines(trimmed);
  if (sseData !== undefined) {
    return sseData === "[DONE]" ? [] : splitJsonValues(sseData);
  }

  if (trimmed.startsWith("data:")) {
    return [];
  }

  return splitJsonValues(trimmed, options.flush === true);
}

function readSseDataLines(block: string): string | undefined {
  const dataLines = block
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) return undefined;
  return dataLines.join("\n").trim();
}

function splitJsonValues(raw: string, flushIncompleteArray = false): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => JSON.stringify(item));
      }
    } catch {
      if (!flushIncompleteArray) return [];
    }
  }

  if (trimmed.startsWith("{")) {
    try {
      JSON.parse(trimmed);
      return [trimmed];
    } catch {
      // NDJSON: one object per line, last line may still be incomplete.
    }
  }

  const payloads: string[] = [];
  for (const line of trimmed.split("\n")) {
    const candidate = line.trim();
    if (!candidate.startsWith("{")) continue;
    try {
      JSON.parse(candidate);
      payloads.push(candidate);
    } catch {
      // Skip incomplete or non-JSON lines.
    }
  }
  return payloads;
}
