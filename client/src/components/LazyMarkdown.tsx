import { lazy, memo, Suspense } from "react";

const MarkdownContent = lazy(() =>
  import("@/components/MarkdownContent").then((mod) => ({ default: mod.MarkdownContent })),
);

/** Memoised so a streaming turn does not re-render every other message's markdown. */
export const LazyMarkdown = memo(function LazyMarkdown({ children }: { children: string }) {
  return (
    <Suspense fallback={<p className="whitespace-pre-wrap">{children}</p>}>
      <MarkdownContent>{children}</MarkdownContent>
    </Suspense>
  );
});
