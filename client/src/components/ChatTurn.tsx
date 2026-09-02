import { memo } from "react";
import { Copy, RotateCw, ThumbsDown, ThumbsUp, Volume2 } from "lucide-react";
import type { PublicMessage } from "@Ken/shared";
import { MessageAttachments } from "@/components/AttachmentChips";
import { LazyMarkdown } from "@/components/LazyMarkdown";
import { MessageAvatar } from "@/components/MessageAvatar";
import { AssistantRichBody } from "@/components/RichContent";
import { ThinkingPipeline } from "@/components/ThinkingPipeline";
import { UserMessageBubble } from "@/components/UserMessageBubble";
import { cn } from "@/utils/cn";

interface ChatTurnProps {
  message: PublicMessage;
  streaming: boolean;
  ttsConfigured: boolean;
  ttsUnavailableReason: string;
  feedbackPending: boolean;
  onEdit: (messageId: string, content: string) => void;
  onRegenerate: (messageId: string) => void;
  onCopy: (text: string) => void;
  onSpeak: (text: string) => void;
  onFeedback: (message: PublicMessage, rating: "up" | "down") => void;
}

/**
 * One chat turn. Memoised on the message object so a streaming token that
 * replaces only the latest assistant row does not rebuild every earlier bubble.
 */
export const ChatTurn = memo(function ChatTurn({
  message,
  streaming,
  ttsConfigured,
  ttsUnavailableReason,
  feedbackPending,
  onEdit,
  onRegenerate,
  onCopy,
  onSpeak,
  onFeedback,
}: ChatTurnProps) {
  if (message.role === "user") {
    return (
      <article className="chat-message flex justify-end gap-3">
        <UserMessageBubble
          content={message.content}
          editDisabled={streaming}
          {...(message.id.startsWith("temp-")
            ? {}
            : { onEdit: (next: string) => onEdit(message.id, next) })}
        >
          {message.attachments?.length ? <MessageAttachments attachments={message.attachments} /> : null}
        </UserMessageBubble>
        <MessageAvatar role="user" />
      </article>
    );
  }

  return (
    <article className="chat-message flex gap-3">
      <MessageAvatar role="assistant" />
      <div className="min-w-0 flex-1">
        <div className="assistant-turn rounded-xl border border-border bg-surface/60 px-4 py-3 text-fg">
          {message.content ? (
            <>
              {message.status === "streaming" ? (
                <LazyMarkdown>{message.content}</LazyMarkdown>
              ) : (
                <AssistantRichBody content={message.content} />
              )}
              {message.status === "streaming" ? (
                <span className="streaming-caret" aria-hidden="true" />
              ) : null}
            </>
          ) : message.status === "streaming" ? (
            <ThinkingPipeline />
          ) : message.status === "error" ? (
            <div role="alert">
              <p className="font-medium">Generation failed</p>
              <p className="mt-1 text-sm text-fg-muted">
                The model dropped or returned an error. You can retry this turn.
              </p>
              <button
                type="button"
                className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-50"
                disabled={streaming}
                onClick={() => onRegenerate(message.id)}
              >
                Retry
              </button>
            </div>
          ) : message.status === "aborted" ? (
            <p className="text-sm text-fg-muted">Generation stopped.</p>
          ) : (
            <p className="text-sm text-fg-muted">No reply was generated. Try sending again.</p>
          )}
        </div>
        <div className="assistant-actions mt-2 flex gap-1">
          <button
            type="button"
            className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-50"
            disabled={streaming}
            aria-label="Regenerate"
            onClick={() => onRegenerate(message.id)}
          >
            <RotateCw className="size-4" />
          </button>
          <button
            type="button"
            className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-50"
            disabled={!message.content}
            aria-label="Copy"
            onClick={() => onCopy(message.content)}
          >
            <Copy className="size-4" />
          </button>
          <button
            type="button"
            className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-50"
            disabled={streaming || !message.content || !ttsConfigured}
            aria-label="Play audio"
            title={ttsConfigured ? "Read aloud" : ttsUnavailableReason}
            onClick={() => void onSpeak(message.content)}
          >
            <Volume2 className="size-4" />
          </button>
          <button
            type="button"
            className={cn(
              "rounded-lg p-1.5 hover:bg-surface-muted hover:text-fg disabled:opacity-50",
              message.feedback?.rating === "up" ? "text-accent" : "text-fg-muted",
            )}
            aria-label="Good response"
            aria-pressed={message.feedback?.rating === "up"}
            disabled={feedbackPending}
            onClick={() => onFeedback(message, "up")}
          >
            <ThumbsUp className="size-4" />
          </button>
          <button
            type="button"
            className={cn(
              "rounded-lg p-1.5 hover:bg-surface-muted hover:text-fg disabled:opacity-50",
              message.feedback?.rating === "down" ? "text-accent" : "text-fg-muted",
            )}
            aria-label="Bad response"
            aria-pressed={message.feedback?.rating === "down"}
            disabled={feedbackPending}
            onClick={() => onFeedback(message, "down")}
          >
            <ThumbsDown className="size-4" />
          </button>
        </div>
      </div>
    </article>
  );
}, chatTurnPropsAreEqual);

function chatTurnPropsAreEqual(prev: ChatTurnProps, next: ChatTurnProps): boolean {
  return (
    prev.message === next.message &&
    prev.streaming === next.streaming &&
    prev.ttsConfigured === next.ttsConfigured &&
    prev.ttsUnavailableReason === next.ttsUnavailableReason &&
    prev.feedbackPending === next.feedbackPending
  );
}
