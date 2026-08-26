import type { MessageStatus, PublicAttachment, PublicMessage, PublicMessageFeedback } from "@Ken/shared";

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

/** Keep the latest N messages mounted so long threads stay at 60 FPS. */
export const CHAT_MESSAGE_WINDOW = 48;

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

export function optimisticTurn(
  content: string,
  conversationId: string,
  attachments: PublicAttachment[] = [],
): { user: PublicMessage; assistant: PublicMessage } {
  const now = new Date().toISOString();
  const suffix = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    user: {
      id: `temp-user-${suffix}`,
      conversationId,
      role: "user",
      content,
      status: "complete",
      createdAt: now,
      updatedAt: now,
      ...(attachments.length > 0 ? { attachments } : {}),
    },
    assistant: {
      id: `temp-assistant-${suffix}`,
      conversationId,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: now,
      updatedAt: now,
    },
  };
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
