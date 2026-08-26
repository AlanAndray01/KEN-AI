import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, onUnauthorized } from "./api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function unauthorized(): Response {
  return jsonResponse({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);
}

const fetchMock = vi.fn();

function calledPaths(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

describe("api session recovery", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes an expired access token and replays the original request", async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(jsonResponse({ user: { id: "u1" } }))
      .mockResolvedValueOnce(jsonResponse({ message: { id: "m1", feedback: { rating: "up" } } }));

    const result = await api.conversations.feedback("c1", "m1", { rating: "up" });

    expect(result.message.feedback).toEqual({ rating: "up" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(calledPaths()[1]).toContain("/auth/refresh");
    expect(calledPaths()[2]).toContain("/conversations/c1/messages/m1/feedback");
  });

  it("reports an authentication error and notifies listeners when refresh fails", async () => {
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(unauthorized());
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);

    await expect(api.conversations.feedback("c1", "m1", { rating: "up" })).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
  });

  it("stops after a single retry instead of looping", async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(jsonResponse({ user: { id: "u1" } }))
      .mockResolvedValueOnce(unauthorized());

    await expect(api.conversations.feedback("c1", "m1", { rating: "up" })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never refreshes on a failed sign-in", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } }, 401),
    );

    await expect(api.auth.login({ email: "a@b.com", password: "nope" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one refresh across concurrent expired requests", async () => {
    fetchMock.mockImplementation(async (input: string) => {
      const url = String(input);
      if (url.includes("/auth/refresh")) return jsonResponse({ user: { id: "u1" } });
      if (fetchMock.mock.calls.filter((call) => String(call[0]).includes("/conversations")).length <= 2) {
        return unauthorized();
      }
      return jsonResponse({ messages: [] });
    });

    await Promise.all([api.conversations.messages("c1"), api.conversations.messages("c2")]);

    const refreshCalls = calledPaths().filter((path) => path.includes("/auth/refresh"));
    expect(refreshCalls).toHaveLength(1);
  });

  it("passes successful responses through untouched", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [{ id: "m1" }] }));

    const result = await api.conversations.messages("c1");

    expect(result.messages).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
