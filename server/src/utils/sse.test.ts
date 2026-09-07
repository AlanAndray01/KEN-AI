import { describe, expect, it, vi } from "vitest";
import { buildSseTiming, extractPayloads, iterateSseData, writeSseDone, writeSseEvent, writeSseHeaders } from "./sse.js";

async function collect(body: string): Promise<string[]> {
  const response = new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  const payloads: string[] = [];
  for await (const payload of iterateSseData(response)) {
    payloads.push(payload);
  }
  return payloads;
}

describe("iterateSseData", () => {
  it("parses LF-delimited SSE frames", async () => {
    const payloads = await collect(
      'data: {"text":"Hel"}\n\ndata: {"text":"lo"}\n\n',
    );
    expect(payloads).toEqual(['{"text":"Hel"}', '{"text":"lo"}']);
  });

  it("parses CRLF-delimited SSE frames used by Gemini", async () => {
    const payloads = await collect(
      'data: {"text":"Hel"}\r\n\r\ndata: {"text":"lo"}\r\n\r\n',
    );
    expect(payloads).toEqual(['{"text":"Hel"}', '{"text":"lo"}']);
  });

  it("parses a JSON array body when alt=sse is not honored", async () => {
    const payloads = await collect('[{"text":"Hel"},{"text":"lo"}]');
    expect(payloads).toEqual(['{"text":"Hel"}', '{"text":"lo"}']);
  });

  it("parses NDJSON objects without a data: prefix", async () => {
    const payloads = await collect('{"text":"Hel"}\n{"text":"lo"}\n');
    expect(payloads).toEqual(['{"text":"Hel"}', '{"text":"lo"}']);
  });
});

describe("extractPayloads", () => {
  it("ignores SSE comments and done sentinels", () => {
    expect(extractPayloads(": keep-alive")).toEqual([]);
    expect(extractPayloads("data: [DONE]")).toEqual([]);
  });
});

describe("writeSseHeaders", () => {
  it("flushes event-stream headers and a comment frame immediately", () => {
    const flush = vi.fn();
    const writes: string[] = [];
    const res = {
      status: vi.fn(),
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: (chunk: string) => {
        writes.push(chunk);
        return true;
      },
      flush,
      socket: { setNoDelay: vi.fn() },
    };

    writeSseHeaders(res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream; charset=utf-8");
    expect(res.flushHeaders).toHaveBeenCalled();
    expect(res.socket.setNoDelay).toHaveBeenCalledWith(true);
    expect(writes[0]).toBe(":\n\n");
    expect(flush).toHaveBeenCalled();
  });
});

describe("writeSseDone", () => {
  it("writes the done sentinel and flushes", () => {
    const flush = vi.fn();
    const writes: string[] = [];
    const res = {
      write: (chunk: string) => {
        writes.push(chunk);
        return true;
      },
      flush,
    };

    writeSseDone(res as never);

    expect(writes.join("")).toBe("data: [DONE]\n\n");
    expect(flush).toHaveBeenCalled();
  });
});

describe("buildSseTiming", () => {
  it("builds a secret-free timing payload the Network panel can read", () => {
    expect(
      buildSseTiming({
        requestId: "5dd687df-c1e0-4eb3-8b5d-3433d9ce24b8",
        requestedModel: "gemini-3.8-flash",
        activeModel: "gemini-3.5-flash-lite",
        fallbackFrom: "gemini-3.8-flash",
        fallbackReason: "PROVIDER_RATE_LIMITED|429|quota_exceeded",
        ttfbMs: 259,
        firstVisibleChunkMs: 820,
        completeMs: 3100,
      }),
    ).toEqual({
      type: "timing",
      requestId: "5dd687df-c1e0-4eb3-8b5d-3433d9ce24b8",
      requestedModel: "gemini-3.8-flash",
      activeModel: "gemini-3.5-flash-lite",
      fallbackFrom: "gemini-3.8-flash",
      fallbackReason: "PROVIDER_RATE_LIMITED|429|quota_exceeded",
      ttfbMs: 259,
      firstVisibleChunkMs: 820,
      completeMs: 3100,
    });
  });
});

describe("writeSseEvent", () => {
  it("writes the event and flushes so the first token is not buffered", () => {
    const flush = vi.fn();
    const writes: string[] = [];
    const res = {
      write: (chunk: string) => {
        writes.push(chunk);
        return true;
      },
      flush,
    };

    writeSseEvent(res as never, "chunk", { type: "chunk", text: "Hi" });

    expect(writes.join("")).toBe('event: chunk\ndata: {"type":"chunk","text":"Hi"}\n\n');
    expect(flush).toHaveBeenCalled();
  });
});
