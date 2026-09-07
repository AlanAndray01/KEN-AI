import { memo, useEffect, useRef, useState } from "react";
import { LazyMarkdown } from "@/components/LazyMarkdown";
import { estimateMarkdownMinHeight } from "@/utils/markdownNeeds";

interface DeferredMarkdownProps {
  children: string;
  /** Newest turns parse immediately so LCP and tests see real markdown. */
  eager?: boolean;
}

/**
 * Off-screen history stays as plain text until it is near the viewport.
 * Parsing 48 turns of remark/rehype/KaTeX on boot is what blocked the main
 * thread for seconds; this keeps the mounted node count but skips the pipeline.
 */
export const DeferredMarkdown = memo(function DeferredMarkdown({
  children,
  eager = false,
}: DeferredMarkdownProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(eager);

  useEffect(() => {
    if (eager) {
      setActive(true);
      return;
    }
    const node = hostRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setActive(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setActive(true);
        observer.disconnect();
      },
      { rootMargin: "480px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [eager]);

  if (active) {
    return <LazyMarkdown>{children}</LazyMarkdown>;
  }

  return (
    <div
      ref={hostRef}
      className="markdown-placeholder"
      style={{ minHeight: estimateMarkdownMinHeight(children) }}
    >
      {children}
    </div>
  );
});
