import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import { CodeBlock } from "@/components/CodeBlock";

const components: Components = {
  pre({ children }) {
    return <CodeBlock>{children}</CodeBlock>;
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

export function MarkdownContent({ children }: MarkdownContentProps) {
  if (!children) {
    return <span className="text-fg-muted">…</span>;
  }

  return (
    <div className="markdown">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
        {children}
      </Markdown>
    </div>
  );
}
