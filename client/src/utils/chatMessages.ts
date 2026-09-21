import type { MessageStatus, PublicAttachment, PublicMessage, PublicMessageFeedback } from "@Ken/shared";

/** Prefix for a client-minted bubble that has no server row behind it yet. */
const OPTIMISTIC_ID_PREFIX = "temp-";

/** The user prompt that produced this assistant turn, for remixing a generated image. */
export function priorUserContent(messages: PublicMessage[], assistant: PublicMessage): string | undefined {
  if (assistant.role !== "assistant") return undefined;
  if (assistant.parentMessageId) {
    const parent = messages.find((message) => message.id === assistant.parentMessageId);
    if (parent?.role === "user" && parent.content.trim()) return parent.content;
  }
  const index = messages.findIndex((message) => message.id === assistant.id);
  if (index < 0) return undefined;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const message = messages[cursor];
    if (message?.role === "user" && message.content.trim()) return message.content;
  }
  return undefined;
}

export function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_ID_PREFIX);
}

export function dedupeMessages(messages: PublicMessage[]): PublicMessage[] {
  const seen = new Set<string>();
  const result: PublicMessage[] = [];
  for (const message of messages) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    result.push(message);
  }
  return result;
}

export function appendChunk(messages: PublicMessage[], text: string): PublicMessage[] {
  const copy = [...messages];
  for (let index = copy.length - 1; index >= 0; index -= 1) {
    const message = copy[index];
    if (message?.role === "assistant") {
      copy[index] = { ...message, content: `${message.content}${text}`, status: "streaming" };
      return copy;
    }
  }
  return copy;
}

/** One network page of history. Matches the on-screen window so a reopen is not a 200-row payload. */
export const CHAT_MESSAGE_WINDOW = 32;
export const HISTORY_PAGE_SIZE = CHAT_MESSAGE_WINDOW;

export type MessageHistoryPage = {
  messages: PublicMessage[];
  hasMore: boolean;
};

/**
 * Keep older pages already in cache when the latest page is refetched (a new
 * reply, an invalidate after streaming). The seam is the oldest row on the
 * latest page; everything before it is history the client already paid for.
 */
export function mergeHistoryPage(
  cached: MessageHistoryPage | undefined,
  latest: MessageHistoryPage,
): MessageHistoryPage {
  if (!cached?.messages.length) return latest;
  const seam = latest.messages[0]?.id;
  const seamIndex = seam ? cached.messages.findIndex((message) => message.id === seam) : -1;
  return {
    messages: mergeMessagePages(cached.messages, latest.messages),
    hasMore: seamIndex > 0 ? cached.hasMore : latest.hasMore,
  };
}

export function mergeMessagePages(cached: PublicMessage[], latest: PublicMessage[]): PublicMessage[] {
  if (cached.length === 0) return latest;
  if (latest.length === 0) return cached;
  const seam = latest[0]?.id;
  if (!seam) return dedupeMessages([...cached, ...latest]);
  const seamIndex = cached.findIndex((message) => message.id === seam);
  if (seamIndex < 0) {
    const latestIds = new Set(latest.map((message) => message.id));
    return dedupeMessages([...cached.filter((message) => !latestIds.has(message.id)), ...latest]);
  }
  return dedupeMessages([...cached.slice(0, seamIndex), ...latest]);
}

export function patchCachedMessages(
  cached: MessageHistoryPage | undefined,
  messages: PublicMessage[],
): MessageHistoryPage {
  return { messages, hasMore: cached?.hasMore ?? false };
}

export function upsertMessage(messages: PublicMessage[], next: PublicMessage): PublicMessage[] {
  const copy = [...messages];
  const index = copy.findIndex((message) => message.id === next.id);
  if (index >= 0) {
    copy[index] = next;
    return copy;
  }
  copy.push(next);
  return copy;
}

/**
 * Ends a live assistant row. Streamed tokens that the complete payload omitted
 * (a truncated persist, an empty Gemini candidate) stay on screen.
 */
export function finishAssistantTurn(messages: PublicMessage[], finished: PublicMessage): PublicMessage[] {
  const copy = [...messages];
  let index = copy.findIndex((message) => message.id === finished.id);
  if (index < 0) {
    index = [...copy].reverse().findIndex((message) => message.role === "assistant");
    index = index < 0 ? -1 : copy.length - 1 - index;
  }
  const local = index >= 0 ? copy[index] : undefined;
  const localContent = local?.content ?? "";
  const incoming = finished.content ?? "";
  const content = incoming.length >= localContent.length ? incoming : localContent;
  const merged: PublicMessage = { ...(local ?? finished), ...finished, content };
  if (index >= 0) {
    copy[index] = merged;
    return copy;
  }
  copy.push(merged);
  return copy;
}

export function optimisticTurn(
  content: string,
  conversationId: string,
  attachments: PublicAttachment[] = [],
  selection?: { model: string; provider: string },
): { user: PublicMessage; assistant: PublicMessage } {
  const now = new Date().toISOString();
  const suffix = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    user: {
      id: `${OPTIMISTIC_ID_PREFIX}user-${suffix}`,
      conversationId,
      role: "user",
      content,
      status: "complete",
      createdAt: now,
      updatedAt: now,
      ...(attachments.length > 0 ? { attachments } : {}),
    },
    assistant: {
      id: `${OPTIMISTIC_ID_PREFIX}assistant-${suffix}`,
      conversationId,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: now,
      updatedAt: now,
      ...(selection ? { model: selection.model, provider: selection.provider } : {}),
    },
  };
}

/**
 * The client-side half of regenerating a turn: drop the answer being replaced
 * and every turn that followed it.
 *
 * Regenerating mid-thread is a branch, not an append. The server supersedes the
 * same range, so keeping the old replies here would leave the discarded branch
 * on screen next to its replacement until the next full refetch.
 *
 * Returns the list unchanged when the id is not present, so a stale click on a
 * message that has already been superseded cannot blank the thread.
 */
export function truncateFromMessage(messages: PublicMessage[], messageId: string): PublicMessage[] {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 0) return messages;
  return messages.slice(0, index);
}

/**
 * Rebuilds the thread when a generation opens.
 *
 * `base` is the list the turn was launched from — already trimmed by
 * truncateFromMessage when the turn replaces part of the thread, so this never
 * has to guess which branch survives.
 *
 * Optimistic bubbles are dropped because the server sends its own rows for the
 * same turn under real ids, and dedupeMessages keeps the first id it sees: left
 * in place they would strand a duplicate that no later event can address.
 *
 * Text already streamed into an optimistic bubble is carried across so a reply
 * that started before the "start" event does not visibly restart. Only an
 * optimistic bubble qualifies — a persisted answer belongs to an earlier turn,
 * and copying its text would open the new one pre-filled with the wrong reply.
 */
export function startTurn(
  base: PublicMessage[],
  userMessage: PublicMessage | undefined,
  assistantMessage: PublicMessage | undefined,
): PublicMessage[] {
  const next = base.filter((message) => !isOptimisticId(message.id));
  if (userMessage) next.push(userMessage);
  if (assistantMessage) {
    const pending = [...base]
      .reverse()
      .find((message) => message.role === "assistant" && isOptimisticId(message.id));
    next.push(
      pending?.content && !assistantMessage.content
        ? { ...assistantMessage, content: pending.content, status: "streaming" }
        : assistantMessage,
    );
  }
  return dedupeMessages(next);
}

/** Updates the executing model on the live assistant row without touching its text. */
export function applyAssistantModel(
  messages: PublicMessage[],
  next: { model?: string; provider?: string; messageId?: string; autoTask?: PublicMessage["autoTask"] },
): PublicMessage[] {
  const copy = [...messages];
  for (let index = copy.length - 1; index >= 0; index -= 1) {
    const message = copy[index];
    if (!message || message.role !== "assistant") continue;
    if (next.messageId && message.id !== next.messageId) continue;
    copy[index] = {
      ...message,
      ...(next.model ? { model: next.model } : {}),
      ...(next.provider ? { provider: next.provider } : {}),
      ...(next.autoTask ? { autoTask: next.autoTask } : {}),
    };
    return copy;
  }
  return copy;
}

export function markLastAssistant(messages: PublicMessage[], status: MessageStatus): PublicMessage[] {
  const copy = [...messages];
  for (let index = copy.length - 1; index >= 0; index -= 1) {
    const message = copy[index];
    if (message?.role === "assistant") {
      copy[index] = { ...message, status };
      return copy;
    }
  }
  return copy;
}

/** Returns a new list with the message's feedback set, or cleared when undefined. */
export function applyFeedback(
  messages: PublicMessage[],
  messageId: string,
  feedback: PublicMessageFeedback | undefined,
): PublicMessage[] {
  return messages.map((message) => {
    if (message.id !== messageId) return message;
    const { feedback: _previous, ...rest } = message;
    return feedback ? { ...rest, feedback } : rest;
  });
}
