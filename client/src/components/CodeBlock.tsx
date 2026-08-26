import { isValidElement, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
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

const PREVIEWABLE = new Set(["html", "htm", "css", "js", "javascript"]);

function previewDocument(language: string, code: string): string {
  if (language === "html" || language === "htm") return code;
  if (language === "css") {
    return `<!DOCTYPE html><html><head><style>${code}</style></head><body></body></html>`;
  }
  // The closing tag is split so this source can never terminate an enclosing
  // <script> block early if the bundle is ever served inline.
  return `<!DOCTYPE html><html><body><script>${code}<${"/"}script></body></html>`;
}

interface CodeBlockProps {
  children?: ReactNode;
}

export function CodeBlock({ children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState(false);
  const codeElement = isValidElement(children) ? children : null;
  const className = codeElement
    ? ((codeElement.props as { className?: string }).className ?? "")
    : "";
  const language = languageFromClassName(className);
  const code = textFromNode(children).replace(/\n$/, "");
  const canPreview = PREVIEWABLE.has(language.toLowerCase());
  const srcDoc = useMemo(
    () => (canPreview ? previewDocument(language.toLowerCase(), code) : ""),
    [canPreview, code, language],
  );

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
        <div className="flex items-center gap-1">
          {canPreview ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface-muted hover:text-fg"
              onClick={() => setPreview((value) => !value)}
            >
              {preview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {preview ? "Code" : "Preview"}
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface-muted hover:text-fg"
            onClick={() => void onCopy()}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      {preview && canPreview ? (
        <iframe
          title="Code preview"
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          className="h-64 w-full bg-white"
        />
      ) : (
        <pre className="overflow-x-auto p-3 text-[0.85rem] leading-6">{children}</pre>
      )}
    </div>
  );
}
