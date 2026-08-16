import { isValidElement, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "@/stores/toastStore";

function textFromNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textFromNode).join("");
  }
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return textFromNode(props.children);
  }
  return "";
}

function languageFromClassName(className: string | undefined): string {
  const match = className?.match(/language-([\w-]+)/);
  return match?.[1] ?? "text";
}

interface CodeBlockProps {
  children?: ReactNode;
}

export function CodeBlock({ children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const codeElement = isValidElement(children) ? children : null;
  const className = codeElement
    ? ((codeElement.props as { className?: string }).className ?? "")
    : "";
  const language = languageFromClassName(className);
  const code = textFromNode(children).replace(/\n$/, "");

  async function onCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast("Copied to clipboard", "success");
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      toast("Unable to copy", "error");
    }
  }

  return (
    <div className="code-block my-3 overflow-hidden rounded-xl border border-border bg-canvas">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-fg-muted">
        <span className="font-medium uppercase tracking-wide">{language}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface-muted hover:text-fg"
          onClick={() => void onCopy()}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[0.85rem] leading-6">
        {children}
      </pre>
    </div>
  );
}
