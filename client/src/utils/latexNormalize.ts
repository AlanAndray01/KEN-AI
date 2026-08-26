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
  // Guards run last: the rules above assume well-formed delimiters, and the
  // escapes added here must survive into the rendered output.
  next = guardIncompleteEnvironment(next);
  next = guardIncompleteMath(next);
  return next;
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
