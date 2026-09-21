import { resolveApiBaseUrl } from "@/utils/apiBaseUrl";
import { ApiError } from "./errors";
import type { ChatStreamEvent } from "./types";

const API_BASE_URL = resolveApiBaseUrl(import.meta.env);

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export const apiBaseUrl = API_BASE_URL;

async function* streamRequest(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const idle = createIdleWatchdog(180_000, signal);
  const init: RequestInit = {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
  init.signal = idle.signal;
  const response = await authedFetch(path, init);

  const requestId = response.headers.get("x-request-id") ?? undefined;
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    let code = "REQUEST_FAILED";
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: { code?: string; message?: string } };
      code = payload.error?.code ?? code;
      message = payload.error?.message ?? message;
    } catch {
      // Non-JSON error bodies are treated as generic failures.
    }
    throw new ApiError(message, { status: response.status, code, ...(requestId ? { requestId } : {}) });
  }

  if (!contentType.includes("text/event-stream") || !response.body) {
    throw new ApiError("Streaming is unavailable", { status: 502, code: "STREAM_UNAVAILABLE" });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      idle.ping();
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const event = parseSseBlock(part);
        if (event) yield event;
      }
    }
    const tail = parseSseBlock(buffer);
    if (tail) yield tail;
  } finally {
    idle.stop();
    reader.releaseLock();
  }
}

function parseSseBlock(block: string): ChatStreamEvent | undefined {
  const eventLine = block.split("\n").find((line) => line.startsWith("event:"));
  const dataLines = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  const raw = dataLines.join("\n").trim();
  if (!raw || raw === "[DONE]") return undefined;
  try {
    const parsed = JSON.parse(raw) as ChatStreamEvent;
    if (eventLine) {
      parsed.type = eventLine.slice(6).trim() as ChatStreamEvent["type"];
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function createIdleWatchdog(
  idleMs: number,
  parent?: AbortSignal,
): { signal: AbortSignal; ping: () => void; stop: () => void } {
  const controller = new AbortController();
  let timer: number | undefined;

  const arm = (): void => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      controller.abort();
    }, idleMs);
  };

  const onParentAbort = (): void => controller.abort();
  parent?.addEventListener("abort", onParentAbort, { once: true });
  arm();

  const signals = parent ? [parent, controller.signal] : [controller.signal];
  return {
    signal: typeof AbortSignal.any === "function" ? AbortSignal.any(signals) : controller.signal,
    ping: arm,
    stop: () => {
      if (timer) window.clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    },
  };
}

/**
 * Endpoints that establish or clear a session. A 401 from these is a real
 * credential failure, so retrying them after a refresh would loop forever.
 */
const SESSION_ENDPOINTS = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
  "/auth/verify-email",
  "/auth/resend-code",
]);

let refreshInFlight: Promise<boolean> | null = null;
const unauthorizedListeners = new Set<() => void>();

/** Notified when the session cannot be recovered and the user must sign in again. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

async function performRefresh(): Promise<boolean> {
  try {
    const response = await fetch(apiUrl("/auth/refresh"), {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Concurrent 401s share one refresh so the refresh token rotates only once. */
function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * The access cookie is short lived while the refresh cookie outlives it. On a
 * 401 we rotate the session once and replay the request, so an expired access
 * token never surfaces to the user as a failed action.
 */
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const requestInit: RequestInit = { ...init, credentials: "include" };
  const response = await fetch(apiUrl(path), requestInit);

  if (response.status !== 401 || SESSION_ENDPOINTS.has(path)) {
    return response;
  }

  if (!(await refreshSession())) {
    for (const listener of unauthorizedListeners) listener();
    return response;
  }

  return fetch(apiUrl(path), requestInit);
}

function apiErrorFromBody(
  status: number,
  requestId: string | undefined,
  body: {
    error?: { code?: string; message?: string };
    emailSent?: boolean;
    requiresVerification?: boolean;
    email?: string;
  },
  fallbackCode: string,
  fallbackMessage: string,
): ApiError {
  return new ApiError(body.error?.message ?? fallbackMessage, {
    status,
    code: body.error?.code ?? fallbackCode,
    ...(requestId ? { requestId } : {}),
    ...(typeof body.emailSent === "boolean" ? { emailSent: body.emailSent } : {}),
    ...(body.requiresVerification === true ? { requiresVerification: true } : {}),
    ...(typeof body.email === "string" ? { email: body.email } : {}),
  });
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authedFetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const requestId = response.headers.get("x-request-id") ?? undefined;

  if (!response.ok) {
    let body: {
      error?: { code?: string; message?: string };
      emailSent?: boolean;
      requiresVerification?: boolean;
      email?: string;
    } = {};
    try {
      body = (await response.json()) as typeof body;
    } catch {
      // Non-JSON error bodies are treated as generic failures.
    }
    throw apiErrorFromBody(
      response.status,
      requestId,
      body,
      "REQUEST_FAILED",
      `Request failed (${response.status})`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function failIfNotOk(response: Response): Promise<void> {
  if (response.ok) return;
  const requestId = response.headers.get("x-request-id") ?? undefined;
  let code = "REQUEST_FAILED";
  let message = `Request failed (${response.status})`;
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    // Non-JSON error bodies are treated as generic failures.
  }
  throw new ApiError(message, {
    status: response.status,
    code,
    ...(requestId ? { requestId } : {}),
  });
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return star[1];
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];
  const plain = /filename=([^;]+)/i.exec(header);
  return plain?.[1]?.trim() ?? fallback;
}

export async function downloadRequest(path: string, fallback: string): Promise<{ blob: Blob; filename: string }> {
  const response = await authedFetch(path);
  await failIfNotOk(response);
  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get("Content-Disposition"), fallback),
  };
}

export { streamRequest };
