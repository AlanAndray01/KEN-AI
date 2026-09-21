import { api } from "@/services/api";

type CachedImage = {
  blob: Blob;
  url: string;
  refs: number;
};

const cache = new Map<string, CachedImage>();
const inflight = new Map<string, Promise<Blob>>();

/** Idle decoded JPEGs kept around so scrolling a long thread does not refetch. */
const MAX_IDLE = 24;

function evictIdle(): void {
  const idle = [...cache.entries()].filter(([, entry]) => entry.refs === 0);
  const overflow = cache.size - MAX_IDLE;
  if (overflow <= 0) return;
  for (const [fileId, entry] of idle.slice(0, overflow)) {
    URL.revokeObjectURL(entry.url);
    cache.delete(fileId);
  }
}

function remember(fileId: string, blob: Blob): CachedImage {
  const existing = cache.get(fileId);
  if (existing) {
    cache.delete(fileId);
    cache.set(fileId, existing);
    return existing;
  }
  const entry: CachedImage = { blob, url: URL.createObjectURL(blob), refs: 0 };
  cache.set(fileId, entry);
  evictIdle();
  return entry;
}

async function loadBlob(fileId: string): Promise<Blob> {
  const cached = cache.get(fileId);
  if (cached) return cached.blob;
  const pending = inflight.get(fileId);
  if (pending) return pending;
  const request = api.files.content(fileId).finally(() => {
    inflight.delete(fileId);
  });
  inflight.set(fileId, request);
  return request;
}

export function retainChatImage(fileId: string, onReady: (entry: { blob: Blob; url: string }) => void): () => void {
  let released = false;
  const cached = cache.get(fileId);
  if (cached) {
    cached.refs += 1;
    cache.delete(fileId);
    cache.set(fileId, cached);
    onReady(cached);
  }

  void loadBlob(fileId)
    .then((blob) => {
      const entry = remember(fileId, blob);
      if (released) return;
      if (!cached) entry.refs += 1;
      onReady(entry);
    })
    .catch(() => undefined);

  return () => {
    if (released) return;
    released = true;
    const entry = cache.get(fileId);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    evictIdle();
  };
}

/** Test helper: drop every object URL so cases do not leak across files. */
export function resetChatImageCache(): void {
  for (const entry of cache.values()) {
    URL.revokeObjectURL(entry.url);
  }
  cache.clear();
  inflight.clear();
}
