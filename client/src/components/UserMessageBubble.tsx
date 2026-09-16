import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Pencil } from "lucide-react";
import { DeferredMarkdown } from "@/components/DeferredMarkdown";
import { cn } from "@/utils/cn";
import { shouldSubmitOnKey } from "@/utils/keyboard";

/**
 * A user turn, collapsed when it is long, with copy and edit controls.
 *
 * Pasting a long block — a log, a spec, an error dump — used to push the actual
 * conversation off screen, so the reply you came back for was never in view.
 * Collapsing keeps the thread readable while leaving the full text one click away.
 *
 * The threshold is measured, not guessed from character count: a 900-character
 * paragraph and a 900-character table occupy very different heights, and only
 * the rendered height decides whether the message is actually in the way.
 */

/** Collapsed height. Roughly nine lines of body text. */
const COLLAPSED_MAX_PX = 220;

/** Below this much overflow, collapsing hides too little to be worth a control. */
const MIN_OVERFLOW_PX = 48;

/** How long the copy button stays in its confirmed state. */
const COPIED_FEEDBACK_MS = 2000;

/** Upper bound on the auto-growing editor before it scrolls instead. */
const EDITOR_MAX_PX = 400;

interface UserMessageBubbleProps {
  content: string;
  /** Omitted for read-only views such as a shared conversation. */
  onEdit?: (content: string) => void | Promise<void>;
  /** Editing starts a new generation, so it is blocked while one is running. */
  editDisabled?: boolean;
  eagerMarkdown?: boolean;
  children?: React.ReactNode;
}

function likelyCollapsible(content: string): boolean {
  if (content.length > 480) return true;
  let lines = 1;
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") lines += 1;
  }
  return lines >= 10;
}

export function UserMessageBubble({
  content,
  onEdit,
  editDisabled,
  eagerMarkdown = true,
  children,
}: UserMessageBubbleProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [collapsible, setCollapsible] = useState(() => likelyCollapsible(content));
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setCollapsible(likelyCollapsible(content));
    setExpanded(false);
  }, [content]);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node || editing) return;

    const measure = (): void => {
      // scrollHeight is the full content height even while the box is clamped.
      setCollapsible(node.scrollHeight > COLLAPSED_MAX_PX + MIN_OVERFLOW_PX);
    };

    // Measure after paint so this read does not sit in the same turn as the
    // markdown write that invalidates layout.
    const frame = window.requestAnimationFrame(measure);
    if (typeof ResizeObserver === "undefined") {
      return () => window.cancelAnimationFrame(frame);
    }
    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(measure);
    });
    observer.observe(node);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [content, editing]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [copied]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
    } catch {
      // Clipboard access is denied in some browsers and over plain HTTP. The
      // text stays selectable, so failing quietly beats an alarming error.
    }
  }

  if (editing) {
    return (
      <MessageEditor
        initialContent={content}
        onCancel={() => setEditing(false)}
        onSubmit={async (next) => {
          setEditing(false);
          await onEdit?.(next);
        }}
      />
    );
  }

  const isClamped = collapsible && !expanded;

  return (
    <div className="user-message group/message flex max-w-[85%] flex-col items-end">
      <div className="w-full rounded-xl border border-accent/20 bg-user-bubble px-4 py-3 text-fg">
        {/*
          Attachments lead the bubble: the file or image is what the text refers
          to ("summarise this"), so it reads first. The gap is only needed when
          text follows.
        */}
        {children ? <div className={content ? "user-message-attachments mb-2" : "user-message-attachments"}>{children}</div> : null}
        <div className="relative">
          <div
            ref={bodyRef}
            className={cn("overflow-hidden", isClamped ? "user-message-clamped" : undefined)}
            style={isClamped ? { maxHeight: `${COLLAPSED_MAX_PX}px` } : undefined}
          >
            {content ? <DeferredMarkdown eager={eagerMarkdown}>{content}</DeferredMarkdown> : null}
          </div>
          {isClamped ? <div className="user-message-fade" aria-hidden="true" /> : null}
        </div>

        {collapsible ? (
          <button
            type="button"
            onClick={() => {
              setExpanded((current) => !current);
            }}
            aria-expanded={expanded}
            className="mt-1 flex items-center gap-1 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
          >
            {expanded ? "Show less" : "Show more"}
            <ChevronDown
              aria-hidden="true"
              className={cn("h-4 w-4 transition-transform", expanded ? "rotate-180" : undefined)}
            />
          </button>
        ) : null}
      </div>

      {/*
        Kept mounted rather than conditionally rendered so the buttons stay
        reachable by keyboard: focus-within reveals them for tab users, hover
        for pointer users, and they are always in the accessibility tree.
      */}
      <div className="user-message-actions mt-1 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100">
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={copied ? "Copied" : "Copy message"}
          title={copied ? "Copied" : "Copy"}
          className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
        >
          {copied ? (
            <Check aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Copy aria-hidden="true" className="h-4 w-4" />
          )}
        </button>
        {onEdit ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={editDisabled}
            aria-label="Edit message"
            title={editDisabled ? "Wait for the current reply to finish" : "Edit"}
            className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Pencil aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MessageEditor({
  initialContent,
  onCancel,
  onSubmit,
}: {
  initialContent: string;
  onCancel: () => void;
  onSubmit: (content: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus with the caret at the end, so typing continues the message rather
  // than replacing a fully selected block.
  useLayoutEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  // Grow with the content instead of showing a fixed box with an inner scrollbar.
  useLayoutEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, EDITOR_MAX_PX)}px`;
  }, [value]);

  const trimmed = value.trim();
  const unchanged = trimmed === initialContent.trim();
  const canSubmit = trimmed.length > 0 && !unchanged;

  function submit(): void {
    if (!canSubmit) return;
    void onSubmit(trimmed);
  }

  return (
    // No border: the bubble background already marks the editor out, and the
    // accent outline read as an error state rather than an active field.
    <div className="w-full max-w-[85%] rounded-[1.5rem] bg-user-bubble px-4 py-3">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          // Same rule as the composer: Ctrl/⌘+Enter sends and Enter is a newline.
          // The editor ignores the Enter-to-send opt-in: resubmitting an edit
          // regenerates the reply, so an accidental send is expensive here.
          if (
            shouldSubmitOnKey(
              {
                key: event.key,
                shiftKey: event.shiftKey,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
                altKey: event.altKey,
                isComposing: event.nativeEvent.isComposing,
              },
              { sendOnEnter: false },
            )
          ) {
            event.preventDefault();
            submit();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        enterKeyHint="enter"
        aria-label="Edit your message"
        rows={1}
        // `message-edit-input` opts out of the global focus ring, the same way
        // the composer does: the field is already visibly the active surface.
        className="message-edit-input w-full resize-none bg-transparent text-fg outline-none"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          title={unchanged ? "Change the message first" : undefined}
          className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        >
          Update
        </button>
      </div>
    </div>
  );
}
