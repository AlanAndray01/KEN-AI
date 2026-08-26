import { memo, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "@/stores/toastStore";

interface MathBlockProps {
  tex: string;
  children: ReactNode;
}

/**
 * A rendered display equation plus a control that copies its original LaTeX.
 *
 * Selecting KaTeX output with the mouse copies the visual layer, which pastes as
 * run-together glyphs. Handing over the `data-tex` annotation instead means an
 * equation can be pasted straight back into a document or another chat and
 * edited as ordinary TeX.
 */
export const MathBlock = memo(function MathBlock({ tex, children }: MathBlockProps) {
  const [copied, setCopied] = useState(false);

  async function onCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(tex);
      setCopied(true);
      toast("LaTeX copied to clipboard", "success");
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      toast("Could not copy to clipboard", "error");
    }
  }

  return (
    <div className="math-block" data-tex={tex}>
      {children}
      <button
        type="button"
        className="math-block-copy"
        aria-label="Copy LaTeX"
        title="Copy LaTeX"
        onClick={() => void onCopy()}
      >
        {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      </button>
    </div>
  );
});

export default MathBlock;
