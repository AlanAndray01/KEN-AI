import { visit } from "unist-util-visit";
import type { Element, Parent, Root } from "hast";

/**
 * Wrap every rendered display-math block in a `div.math-block` carrying the
 * expression's original LaTeX in `data-tex`.
 *
 * KaTeX renders two layers: a visual HTML layer marked `aria-hidden`, and a
 * MathML layer holding an `<annotation encoding="application/x-tex">` with the
 * source TeX. Selecting the rendered output copies the visual layer, which comes
 * out as run-together glyphs rather than anything you could paste back into a
 * document. Lifting the annotation onto the wrapper lets the UI hand over the
 * real LaTeX instead, so an equation stays editable after it leaves the chat.
 *
 * Must run after `rehype-katex`, which is what creates the nodes this looks for.
 */
export function rehypeMathBlock() {
  return (tree: Root): void => {
    const targets: Array<{ node: Element; parent: Parent; index: number }> = [];

    visit(tree, "element", (node: Element, index, parent) => {
      if (!parent || typeof index !== "number") return;
      if (!hasClass(node, "katex-display")) return;
      targets.push({ node, parent, index });
    });

    // Mutate after the walk: replacing a node with a wrapper that contains it
    // would otherwise be re-visited and wrapped again without end.
    for (const { node, parent, index } of targets.reverse()) {
      const tex = findTexAnnotation(node);
      if (!tex) continue;
      parent.children[index] = {
        type: "element",
        tagName: "div",
        properties: { className: ["math-block"], dataTex: tex },
        children: [node],
      } satisfies Element;
    }
  };
}

function hasClass(node: Element, name: string): boolean {
  // hast normally stores className as an array, but a hand-built or
  // string-valued tree is equally legal, so accept both shapes.
  const className: unknown = node.properties?.["className"];
  if (Array.isArray(className)) return className.includes(name);
  if (typeof className === "string") return className.split(/\s+/).includes(name);
  return false;
}

/** Depth-first search for KaTeX's `<annotation encoding="application/x-tex">`. */
function findTexAnnotation(node: Element): string | undefined {
  let found: string | undefined;

  visit(node, "element", (candidate: Element) => {
    if (found !== undefined) return;
    if (candidate.tagName !== "annotation") return;
    if (candidate.properties?.["encoding"] !== "application/x-tex") return;
    const text = collectText(candidate).trim();
    if (text) found = text;
  });

  return found;
}

function collectText(node: Element): string {
  return node.children
    .map((child) => {
      if (child.type === "text") return child.value;
      if (child.type === "element") return collectText(child);
      return "";
    })
    .join("");
}
