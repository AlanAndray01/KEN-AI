import type { PublicConversation, PublicMessage, PublicMessageFeedback } from "@aether/shared";
import type { MessageStatus } from "@aether/shared";

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

export function toPublicConversation(doc: {
  id?: string;
  _id?: { toString(): string };
  title: string;
  modelId: string;
  providerId: string;
  archived: boolean;
  pinned?: boolean;
  lastMessageAt?: Date | string | null;
  lastMessagePreview?: string | null;
  messageCount?: number;
  customGptId?: { toString(): string } | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}): PublicConversation {
  return {
    id: doc.id ?? String(doc._id),
    title: doc.title,
    modelId: doc.modelId,
    providerId: doc.providerId,
    ...(doc.customGptId ? { customGptId: String(doc.customGptId) } : {}),
    archived: doc.archived,
    pinned: Boolean(doc.pinned),
    ...(doc.lastMessageAt ? { lastMessageAt: iso(doc.lastMessageAt) } : {}),
    ...(doc.lastMessagePreview ? { lastMessagePreview: doc.lastMessagePreview } : {}),
    messageCount: doc.messageCount ?? 0,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}

export function toPublicMessage(
  doc: {
    id?: string;
    _id?: { toString(): string };
    conversationId: { toString(): string } | string;
    role: PublicMessage["role"];
    content?: string | null;
    model?: string | null;
    provider?: string | null;
    status?: MessageStatus | null;
    parentMessageId?: { toString(): string } | string | null;
    generationId?: string | null;
    feedback?: { rating?: "up" | "down" | null; comment?: string | null } | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  },
  attachments?: PublicMessage["attachments"],
): PublicMessage {
  const feedback: PublicMessageFeedback | undefined =
    doc.feedback?.rating === "up" || doc.feedback?.rating === "down"
      ? {
          rating: doc.feedback.rating,
          ...(doc.feedback.comment ? { comment: doc.feedback.comment } : {}),
        }
      : undefined;

  return {
    id: doc.id ?? String(doc._id),
    conversationId: String(doc.conversationId),
    role: doc.role,
    content: doc.content ?? "",
    ...(doc.model ? { model: doc.model } : {}),
    ...(doc.provider ? { provider: doc.provider } : {}),
    status: doc.status ?? "complete",
    ...(doc.parentMessageId ? { parentMessageId: String(doc.parentMessageId) } : {}),
    ...(feedback ? { feedback } : {}),
    ...(doc.generationId ? { generationId: doc.generationId } : {}),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}
