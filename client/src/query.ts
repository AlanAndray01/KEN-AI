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
 */
export function prefetchSignedInWorkspace(queryClient: QueryClient, pathname = window.location.pathname): void {
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
}
