/** Cheap source checks so MarkdownContent can skip KaTeX and highlight.js. */

export function sourceNeedsMath(source: string): boolean {
  return /\$|\\\[|\\\(/.test(source);
}

export function sourceNeedsHighlight(source: string): boolean {
  return source.includes("```");
}

/** Rough height for a deferred markdown placeholder so the swap does not jump. */
export function estimateMarkdownMinHeight(source: string): number {
  let lines = 1;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") lines += 1;
  }
  return Math.min(360, Math.max(44, lines * 22));
}
