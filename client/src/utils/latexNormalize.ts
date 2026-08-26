/** Convert common model LaTeX mistakes into KaTeX-friendly markdown. Leaves fenced code alone. */
export function normalizeLatex(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?```)/g)
    .map((part, index) => (index % 2 === 1 ? part : normalizeProse(part)))
    .join("");
}

function normalizeProse(source: string): string {
  let next = source;
  next = next.replace(
    /(?<!\$)(^|\n)(\\begin\{(?:aligned|pmatrix|bmatrix|vmatrix|cases)[^}]*\}[\s\S]*?\\end\{[^}]+\})/gm,
    (_match, prefix: string, env: string) => `${prefix}\n\n$$${env.trim()}$$\n\n`,
  );
  next = next.replace(/\\\[([\s\S]+?)\\\]/g, (_match, inner: string) => `\n\n$$${inner.trim()}$$\n\n`);
  next = next.replace(/\\\((.+?)\\\)/g, (_match, inner: string) => `$${inner.trim()}$`);
  next = next.replace(/\\{2,}([a-zA-Z]{2,})/g, (_match, command: string) => `\\${command}`);
  next = isolateDisplayMath(next);
  // Guards run last: the rules above assume well-formed delimiters, and the
  // escapes added here must survive into the rendered output.
  next = guardIncompleteEnvironment(next);
  next = guardIncompleteMath(next);
  return next;
}

/**
 * Put the delimiters of a multi-line `$$…$$` block on lines of their own.
 *
 * remark-math only reads `$$` as a display block when the opening fence sits
 * alone on its line; anything trailing it is parsed as the fence's *meta*, and
 * the block then runs until a line that is nothing but `$$`. Models reliably
 * write `$$\begin{aligned}` … `\end{aligned}$$`, which has neither — so the
 * fence never closes, the environment is swallowed into the meta, and every
 * following paragraph is dragged into one math node that KaTeX paints as a red
 * parse error. Splitting the delimiters out restores an ordinary display block.
 */
function isolateDisplayMath(source: string): string {
  let result = "";
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    // Copy escape pairs verbatim so `\$` never looks like a delimiter.
    if (char === "\\") {
      result += source.slice(index, index + 2);
      index += 2;
      continue;
    }

    if (char === "$" && source[index + 1] === "$") {
      const close = findClosingDisplay(source, index + 2);
      const body = close < 0 ? null : source.slice(index + 2, close);
      // An unclosed opener is still streaming; guardIncompleteMath handles it.
      // A short one-line span such as `$$a=1$$` already renders, so leave the
      // author's spacing alone and only rewrite what remark-math would misread.
      if (body === null || (!body.includes("\n") && !body.includes("\\begin{"))) {
        result += "$$";
        index += 2;
        continue;
      }

      result = result.replace(/[ \t]+$/, "");
      if (result.length > 0 && !result.endsWith("\n\n")) {
        result += result.endsWith("\n") ? "\n" : "\n\n";
      }
      result += `$$\n${body.trim()}\n$$\n`;

      // Skip the whitespace that followed the closing fence: the blank line
      // added here is what separates the block from the next paragraph.
      let cursor = close + 2;
      while (cursor < source.length && (source[cursor] === " " || source[cursor] === "\t" || source[cursor] === "\n")) {
        cursor += 1;
      }
      if (cursor < source.length) result += "\n";
      index = cursor;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

/** Index of the `$$` that closes an opener, or -1 while it is still streaming. */
function findClosingDisplay(source: string, from: number): number {
  let index = from;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === "$" && source[index + 1] === "$") return index;
    index += 1;
  }
  return -1;
}

/**
 * A response arrives one token at a time, so mid-stream text routinely ends
 * inside a half-written expression such as `$$\frac{a}{`. Handing that to KaTeX
 * paints a red error node that vanishes on the next frame, which reads as
 * flicker and shifts the layout. Escaping the dangling opener instead keeps the
 * partial text visible as plain prose until its closing delimiter arrives.
 */
function guardIncompleteMath(source: string): string {
  let result = "";
  let index = 0;
  let openDelimiter: "$" | "$$" | null = null;
  let openAt = -1;

  while (index < source.length) {
    const char = source[index];

    // Copy escape pairs verbatim so `\$` never toggles math state.
    if (char === "\\") {
      result += source.slice(index, index + 2);
      index += 2;
      continue;
    }

    if (char === "$") {
      const delimiter: "$" | "$$" = source[index + 1] === "$" ? "$$" : "$";
      if (openDelimiter === null) {
        openDelimiter = delimiter;
        openAt = result.length;
      } else if (openDelimiter === delimiter) {
        openDelimiter = null;
        openAt = -1;
      }
      result += delimiter;
      index += delimiter.length;
      continue;
    }

    result += char;
    index += 1;
  }

  if (openDelimiter === null || openAt < 0) return result;
  const escaped = openDelimiter === "$$" ? "\\$\\$" : "\\$";
  return result.slice(0, openAt) + escaped + result.slice(openAt + openDelimiter.length);
}

/**
 * Same idea for a `\begin{aligned}` block whose `\end` has not streamed in yet:
 * neutralise the opener so remark-math leaves the fragment as plain text.
 */
function guardIncompleteEnvironment(source: string): string {
  const opened = source.match(/\\begin\{/g)?.length ?? 0;
  const closed = source.match(/\\end\{/g)?.length ?? 0;
  if (opened <= closed) return source;

  const lastBegin = source.lastIndexOf("\\begin{");
  if (lastBegin < 0) return source;
  return `${source.slice(0, lastBegin)}\\${source.slice(lastBegin)}`;
}
