import type { ChatMessage } from "../ai/AIProvider.js";

/**
 * Code shrinking for the copy of the history that is sent to the model.
 *
 * Code is the densest thing in a chat and the thing most often repeated: a
 * file is written, fixed, and rewritten, and every earlier version used to be
 * resent in full on every turn. Here, a long fenced block in an older message
 * is replaced by a one-line stub naming the language, file, size, and what it
 * defines. The newest version of each named file is always kept whole, so the
 * model still has the code it is actually working on.
 *
 * Only the model's copy changes. Message rows are never edited, so the chat
 * the user sees is exactly what was written.
 */

/** Messages at the end of the history that are always sent exactly as written. */
export const VERBATIM_TAIL_MESSAGES = 4;

/** A short snippet costs little and is often what the next question is about. */
const MIN_STUB_LINES = 8;
const MAX_LISTED_SYMBOLS = 8;

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})([^`]*)$/;
const FILE_NAME = String.raw`(?:[\w@.-]+\/)*[\w@-][\w@.-]*\.[A-Za-z][A-Za-z0-9]{0,7}`;
const FILE_TOKEN = new RegExp(`^${FILE_NAME}$`);
const INFO_FILE_ATTR = /(?:title|filename|file|name)=["']?([^"'\s]+)/i;
const LEADING_COMMENT_FILE = new RegExp(`^\\s*(?:\\/\\/|#|--|\\/\\*|<!--|;)\\s*(${FILE_NAME})\\b`);
const LABEL_FILE = new RegExp(`\`(${FILE_NAME})\`|\\*\\*(${FILE_NAME})\\*\\*|(?:^|[\\s(])(${FILE_NAME})(?=[\\s:,)]|$)`, "g");

const SYMBOL_PATTERNS: readonly RegExp[] = [
  /\bfunction\*?\s+([A-Za-z_$][\w$]*)/g,
  /\bclass\s+([A-Za-z_$][\w$]*)/g,
  /\b(?:interface|type|enum|struct|trait)\s+([A-Za-z_$][\w$]*)/g,
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=>/g,
  /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/gm,
  /\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/g,
  /\bfn\s+([A-Za-z_]\w*)/g,
];

interface CodeBlock {
  /** Line index of the opening fence. */
  open: number;
  /** Line index of the closing fence, or the last line when the fence was never closed. */
  close: number;
  lang: string;
  file?: string;
  body: string[];
}

export interface CompactCodeOptions {
  /** Trailing non-system messages to leave untouched. */
  verbatimTail?: number;
  /** Stub every long block, including the newest version of a file. For summariser input. */
  stubAll?: boolean;
}

export function compactCodeHistory(messages: ChatMessage[], options: CompactCodeOptions = {}): ChatMessage[] {
  const tail = options.verbatimTail ?? VERBATIM_TAIL_MESSAGES;
  const turnIndexes = messages.flatMap((message, index) => (message.role === "system" ? [] : [index]));
  const protectedFrom = turnIndexes.length > tail ? turnIndexes[turnIndexes.length - tail]! : 0;

  const parsed = messages.map((message) =>
    message.role === "system" || !hasFence(message.content) ? undefined : findCodeBlocks(message.content),
  );

  // The newest block for each file, across the whole history. A version in the
  // verbatim tail counts too: it makes every older copy of that file redundant.
  const newest = new Map<string, string>();
  parsed.forEach((blocks, messageIndex) => {
    blocks?.forEach((block, blockIndex) => {
      if (block.file) newest.set(fileKey(block.file), `${messageIndex}:${blockIndex}`);
    });
  });

  return messages.map((message, messageIndex) => {
    const blocks = parsed[messageIndex];
    if (!blocks?.length || messageIndex >= protectedFrom) return message;
    const lines = message.content.split("\n");
    let changed = false;
    // Back to front, so replacing one block never shifts the line numbers of another.
    for (let blockIndex = blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
      const block = blocks[blockIndex]!;
      if (block.body.length < MIN_STUB_LINES) continue;
      const isNewest = block.file !== undefined && newest.get(fileKey(block.file)) === `${messageIndex}:${blockIndex}`;
      if (isNewest && !options.stubAll) continue;
      lines.splice(block.open, block.close - block.open + 1, describeBlock(block));
      changed = true;
    }
    return changed ? { ...message, content: lines.join("\n") } : message;
  });
}

export function findCodeBlocks(text: string): CodeBlock[] {
  const lines = text.split("\n");
  const blocks: CodeBlock[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = FENCE_OPEN.exec(lines[index]!);
    if (!match) continue;
    const fence = match[1]!;
    const info = (match[2] ?? "").trim();
    let close = index + 1;
    while (close < lines.length && !closesFence(lines[close]!, fence)) close += 1;
    const closed = close < lines.length;
    const body = lines.slice(index + 1, closed ? close : lines.length);
    const lang = languageOf(info);
    const file = fileFromInfo(info) ?? fileFromComment(body[0]) ?? fileFromLabel(lines, index);
    blocks.push({ open: index, close: closed ? close : lines.length - 1, lang, body, ...(file ? { file } : {}) });
    index = close;
  }
  return blocks;
}

function hasFence(text: string): boolean {
  return text.includes("```") || text.includes("~~~");
}

function closesFence(line: string, fence: string): boolean {
  const trimmed = line.trim();
  return trimmed.length >= fence.length && trimmed === fence[0]!.repeat(trimmed.length);
}

function languageOf(info: string): string {
  const first = info.split(/\s+/)[0] ?? "";
  return first.split(/[:{]/)[0]?.toLowerCase() ?? "";
}

function fileFromInfo(info: string): string | undefined {
  if (!info) return undefined;
  const attr = INFO_FILE_ATTR.exec(info)?.[1];
  if (attr) return attr;
  const [first = "", ...rest] = info.split(/\s+/);
  const afterColon = first.includes(":") ? first.slice(first.indexOf(":") + 1) : "";
  if (afterColon && FILE_TOKEN.test(afterColon)) return afterColon;
  return rest.find((token) => FILE_TOKEN.test(token));
}

function fileFromComment(firstLine: string | undefined): string | undefined {
  return firstLine ? LEADING_COMMENT_FILE.exec(firstLine)?.[1] : undefined;
}

/** A file named on the prose line just above the fence: "Here is `src/auth.ts`:" */
function fileFromLabel(lines: string[], openIndex: number): string | undefined {
  for (let index = openIndex - 1, seen = 0; index >= 0 && seen < 2; index -= 1) {
    const line = lines[index]!.trim();
    if (!line) continue;
    seen += 1;
    if (FENCE_OPEN.test(line)) return undefined;
    let last: string | undefined;
    for (const match of line.matchAll(LABEL_FILE)) last = match[1] ?? match[2] ?? match[3];
    if (last) return last;
  }
  return undefined;
}

function fileKey(file: string): string {
  return (file.split("/").pop() ?? file).toLowerCase();
}

function symbolsOf(body: string[]): string[] {
  const source = body.join("\n");
  const found = new Set<string>();
  for (const pattern of SYMBOL_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) found.add(match[1]);
    }
  }
  return [...found];
}

function describeBlock(block: CodeBlock): string {
  const symbols = symbolsOf(block.body);
  const listed = symbols.slice(0, MAX_LISTED_SYMBOLS).join(", ");
  const more = symbols.length > MAX_LISTED_SYMBOLS ? ` and ${symbols.length - MAX_LISTED_SYMBOLS} more` : "";
  const what = [block.lang || "code", block.file ? `"${block.file}"` : undefined].filter(Boolean).join(" ");
  const defines = listed ? `, defines ${listed}${more}` : "";
  return `[Earlier ${what} block, ${block.body.length} lines${defines}. Omitted here to save space; the user still sees it in full. If its exact lines matter, ask the user to paste it rather than guessing.]`;
}
