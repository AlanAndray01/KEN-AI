import type { Response as ExpressResponse } from "express";

export function writeSseHeaders(res: ExpressResponse): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
}

export function writeSseEvent(res: ExpressResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

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
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const payload = extractSseData(part);
        if (payload) yield payload;
      }
    }

    const tail = extractSseData(buffer);
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

function extractSseData(block: string): string | undefined {
  const lines = block
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  const data = lines.join("\n").trim();
  if (!data || data === "[DONE]") return undefined;
  return data;
}
