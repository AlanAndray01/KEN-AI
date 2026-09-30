import { describe, expect, it, vi } from "vitest";
import { createTtlCache, invalidateCredentialCaches, onCredentialsChanged } from "./credentialCache.js";

describe("createTtlCache", () => {
  it("serves a repeat read from memory until the TTL passes", async () => {
    let now = 1_000;
    const cache = createTtlCache<string>(30_000, () => now);
    const load = vi.fn(async () => "key");

    await cache.get("groq", load);
    await cache.get("groq", load);
    expect(load).toHaveBeenCalledTimes(1);

    now += 30_001;
    await cache.get("groq", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight read between concurrent callers", async () => {
    const cache = createTtlCache<number>(30_000);
    const load = vi.fn(async () => 7);
    const [a, b] = await Promise.all([cache.get("k", load), cache.get("k", load)]);
    expect([a, b]).toEqual([7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never serves a failed read to the next caller", async () => {
    const cache = createTtlCache<number>(30_000);
    await expect(cache.get("k", async () => Promise.reject(new Error("db down")))).rejects.toThrow("db down");
    await expect(cache.get("k", async () => 3)).resolves.toBe(3);
  });

  it("does not cache at all with a zero TTL", async () => {
    const cache = createTtlCache<number>(0);
    const load = vi.fn(async () => 1);
    await cache.get("k", load);
    await cache.get("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("clears every registered cache when a key changes", async () => {
    const cache = createTtlCache<string>(30_000);
    onCredentialsChanged(() => cache.clear());
    const load = vi.fn(async () => "old");
    await cache.get("k", load);
    invalidateCredentialCaches();
    await cache.get("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
