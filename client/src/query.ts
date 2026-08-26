/** Default React Query freshness for profile, models, credentials, and prefs. */
export const QUERY_STALE_MS = 5 * 60_000;

/** Conversation lists change when chats are created or renamed. */
export const CONVERSATION_STALE_MS = 30_000;

/** Message threads should refetch soon after streaming settles. */
export const MESSAGE_STALE_MS = 15_000;
