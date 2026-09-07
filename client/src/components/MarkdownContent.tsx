import { memo, useEffect, useMemo, useState, type ComponentProps } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { stripReasoning } from "@Ken/shared";
import { CodeBlock } from "@/components/CodeBlock";
import { MathBlock } from "@/components/MathBlock";
import { normalizeLatex } from "@/utils/latexNormalize";
import { sourceNeedsHighlight, sourceNeedsMath } from "@/utils/markdownNeeds";
import { rehypeMathBlock } from "@/utils/rehypeMathBlock";

const components: Components = {
  pre({ children }) {
    return <CodeBlock>{children}</CodeBlock>;
  },
  div({ className, children, node }) {
    // rehypeMathBlock wraps each display equation and parks its source LaTeX on
    // the wrapper; everything else passes through untouched.
    if (className?.includes("math-block")) {
      const properties = node?.properties ?? {};
      const tex = properties["dataTex"] ?? properties["data-tex"];
      return <MathBlock tex={typeof tex === "string" ? tex : ""}>{children}</MathBlock>;
    }
    return <div className={className}>{children}</div>;
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

type HighlightPlugin = (typeof import("rehype-highlight"))["default"];
type RemarkMathPlugin = (typeof import("remark-math"))["default"];
type RehypeKatexPlugin = (typeof import("rehype-katex"))["default"];

interface MathPlugins {
  remarkMath: RemarkMathPlugin;
  rehypeKatex: RehypeKatexPlugin;
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

  const needsMath = useMemo(() => sourceNeedsMath(source), [source]);
  const needsHighlight = useMemo(() => sourceNeedsHighlight(source), [source]);
  const [highlightPlugin, setHighlightPlugin] = useState<HighlightPlugin | null>(null);
  const [mathPlugins, setMathPlugins] = useState<MathPlugins | null>(null);

  useEffect(() => {
    if (!needsHighlight) {
      setHighlightPlugin(null);
      return;
    }
    let cancelled = false;
    void import("rehype-highlight").then((mod) => {
      if (!cancelled) setHighlightPlugin(() => mod.default);
    });
    return () => {
      cancelled = true;
    };
  }, [needsHighlight]);

  useEffect(() => {
    if (!needsMath) {
      setMathPlugins(null);
      return;
    }
    let cancelled = false;
    void Promise.all([import("remark-math"), import("rehype-katex"), import("katex/dist/katex.min.css")]).then(
      ([remarkMath, rehypeKatex]) => {
        if (!cancelled) {
          setMathPlugins({
            remarkMath: remarkMath.default,
            rehypeKatex: rehypeKatex.default,
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [needsMath]);

  const remarkPlugins = useMemo(
    () => (mathPlugins ? [remarkGfm, mathPlugins.remarkMath] : [remarkGfm]),
    [mathPlugins],
  );

  const rehypePlugins = useMemo(() => {
    const plugins: NonNullable<ComponentProps<typeof Markdown>["rehypePlugins"]> = [];
    if (mathPlugins) {
      plugins.push(mathPlugins.rehypeKatex, rehypeMathBlock);
    }
    if (highlightPlugin) {
      plugins.push(highlightPlugin);
    }
    return plugins;
  }, [highlightPlugin, mathPlugins]);

  if (!children) {
    return <span className="text-fg-muted">…</span>;
  }

  return (
    <div className="markdown">
      <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {source}
      </Markdown>
    </div>
  );
});

export default MarkdownContent;
