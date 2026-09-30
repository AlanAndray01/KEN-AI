import { isTest } from "../../config/env.js";

/**
 * Short-lived memo for the credential and model reads every chat turn makes.
 *
 * A single send used to resolve credentials twice (the turn quota charge and
 * the adapter) at two or three sequential Mongo round trips each, before the
 * model was asked anything. With Atlas in a different region from the API
 * server, each round trip costs 150-250 ms, so those reads alone held the first
 * word back by one to two seconds on every message.
 *
 * Values are promises, so concurrent callers share one in-flight read instead
 * of each starting their own. A rejected read is dropped straight away and
 * never served from the cache. Every write to a provider, model, or user key
 * calls invalidateCredentialCaches(), so the TTL only bounds staleness for a
 * change made on another instance.
 *
 * Off under NODE_ENV=test: integration tests write keys straight to the
 * database and expect the next read to see them.
 */
export const CREDENTIAL_CACHE_MS = isTest ? 0 : 30_000;

/** Beyond this many keys, expired entries are pruned before adding another. */
const MAX_ENTRIES = 2_000;

export interface TtlCache<V> {
  get(key: string, load: () => Promise<V>): Promise<V>;
  clear(): void;
}

export function createTtlCache<V>(ttlMs: number, now: () => number = Date.now): TtlCache<V> {
  const entries = new Map<string, { at: number; value: Promise<V> }>();

  const prune = (): void => {
    const cutoff = now() - ttlMs;
    for (const [key, entry] of entries) {
      if (entry.at < cutoff) entries.delete(key);
    }
  };

  return {
    get(key, load) {
      if (ttlMs <= 0) return load();
      const hit = entries.get(key);
      if (hit && now() - hit.at < ttlMs) return hit.value;
      if (entries.size >= MAX_ENTRIES) prune();
      const value = load();
      entries.set(key, { at: now(), value });
      value.catch(() => {
        if (entries.get(key)?.value === value) entries.delete(key);
      });
      return value;
    },
    clear() {
      entries.clear();
    },
  };
}

const listeners = new Set<() => void>();

/** Registers a cache to be cleared whenever a provider, model, or key changes. */
export function onCredentialsChanged(listener: () => void): void {
  listeners.add(listener);
}

/** Call after any write to AIProvider, AIModel, or UserProviderCredential. */
export function invalidateCredentialCaches(): void {
  for (const listener of listeners) listener();
}
