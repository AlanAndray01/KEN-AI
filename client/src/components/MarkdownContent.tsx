import { memo, useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import type { Components } from "react-markdown";
import { stripReasoning } from "@Ken/shared";
import { CodeBlock } from "@/components/CodeBlock";
import { normalizeLatex } from "@/utils/latexNormalize";
import "katex/dist/katex.min.css";

const components: Components = {
  pre({ children }) {
    return <CodeBlock>{children}</CodeBlock>;
  },
  table({ children }) {
    // A wide table must scroll inside its own box; without this it either
    // overflows the chat column or squeezes cells until the text is unreadable.
    return (
      <div className="markdown-table-wrap">
        <table>{children}</table>
      </div>
    );
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
        {children}
      </a>
    );
  },
  code({ className, children, node: _node, ...props }) {
    const isBlock = Boolean(className?.includes("language-") || className?.includes("hljs"));
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[0.9em]" {...props}>
        {children}
      </code>
    );
  },
};

interface MarkdownContentProps {
  children: string;
}

/**
 * Memoised on `children`: a streaming turn re-renders the message list on every
 * animation frame, and without this every mounted message would re-run the full
 * remark/rehype/KaTeX pipeline each time. Message objects keep their identity
 * while streaming, so only the turn actually receiving tokens re-parses.
 */
export const MarkdownContent = memo(function MarkdownContent({ children }: MarkdownContentProps) {
  const source = useMemo(() => {
    // Reasoning traces are filtered server-side before a reply is stored, but
    // conversations saved before that filter existed still hold raw `<think>`
    // blocks in MongoDB. Stripping again at render keeps those history entries
    // readable without a data migration, and costs nothing for clean content.
    const { visible } = stripReasoning(children);
    return normalizeLatex(visible);
  }, [children]);

  if (!children) {
    return <span className="text-fg-muted">…</span>;
  }

  return (
    <div className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={components}
      >
        {source}
      </Markdown>
    </div>
  );
});

export default MarkdownContent;
