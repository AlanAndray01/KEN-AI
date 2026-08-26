import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { LazyMarkdown } from "@/components/LazyMarkdown";
import { cn } from "@/utils/cn";

/**
 * A user turn, collapsed when it is long.
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

interface UserMessageBubbleProps {
  content: string;
  children?: React.ReactNode;
}

export function UserMessageBubble({ content, children }: UserMessageBubbleProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [collapsible, setCollapsible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const node = bodyRef.current;
    if (!node) return;

    const measure = (): void => {
      // scrollHeight is the full content height even while the box is clamped.
      setCollapsible(node.scrollHeight > COLLAPSED_MAX_PX + MIN_OVERFLOW_PX);
    };

    measure();

    // Markdown, KaTeX and fonts all settle after first paint, and the bubble
    // reflows on window resize, so re-measure instead of trusting the first read.
    // Guarded because non-browser render targets have no ResizeObserver; the
    // synchronous measurement above is still correct without it.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [content]);

  const isClamped = collapsible && !expanded;

  return (
    <div className="max-w-[85%] rounded-[1.5rem] bg-user-bubble px-4 py-3 text-fg">
      <div className="relative">
        <div
          ref={bodyRef}
          className={cn("overflow-hidden", isClamped ? "user-message-clamped" : undefined)}
          style={isClamped ? { maxHeight: `${COLLAPSED_MAX_PX}px` } : undefined}
        >
          {content ? <LazyMarkdown>{content}</LazyMarkdown> : null}
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

      {children}
    </div>
  );
}
