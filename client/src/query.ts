import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";

/** Default React Query freshness for profile, models, credentials, and prefs. */
export const QUERY_STALE_MS = 5 * 60_000;

/** Conversation lists change when chats are created or renamed. */
export const CONVERSATION_STALE_MS = 30_000;

/** Message threads should refetch soon after streaming settles. */
export const MESSAGE_STALE_MS = 15_000;

export function conversationIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/chat\/([^/?#]+)$/);
  return match?.[1];
}

/**
 * Start the workspace reads as soon as a session exists, so they overlap the
 * lazy ChatPage chunk instead of waiting for it to mount.
 *
 * That overlap is the whole point, and it only exists on a chat route. Anywhere
 * else — most of all the landing page — there is no ChatPage chunk in flight to
 * overlap, so these are speculative reads for a navigation that may never
 * happen, and running them during load put two multi-second API calls
 * (/conversations and /models, measured at 2.4s and 2.7s against a cold server)
 * in direct competition with the hero paint. Off a chat route they are
 * therefore deferred to idle: still warm before the user clicks through, no
 * longer part of the critical path.
 *
 * Returns a disposer for the idle handle; immediate prefetches have nothing to
 * cancel, and a request already in flight is left alone.
 */
export function prefetchSignedInWorkspace(
  queryClient: QueryClient,
  pathname = window.location.pathname,
): () => void {
  const run = (): void => {
    void queryClient.prefetchQuery({
      queryKey: ["conversations"],
      queryFn: () => api.conversations.list(),
      staleTime: CONVERSATION_STALE_MS,
    });
    void queryClient.prefetchQuery({
      queryKey: ["models"],
      queryFn: () => api.models.list(),
      staleTime: QUERY_STALE_MS,
    });
    const conversationId = conversationIdFromPath(pathname);
    if (!conversationId) return;
    void queryClient.prefetchQuery({
      queryKey: ["messages", conversationId],
      queryFn: () => api.conversations.messages(conversationId),
      staleTime: MESSAGE_STALE_MS,
    });
  };

  if (pathname.startsWith("/chat")) {
    run();
    return () => {};
  }

  if ("requestIdleCallback" in window) {
    const handle = window.requestIdleCallback(run, { timeout: 3000 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = globalThis.setTimeout(run, 1200);
  return () => globalThis.clearTimeout(handle);
}
