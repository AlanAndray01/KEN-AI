/**
 * Section search over an attached document.
 *
 * A document used to reach the model in one of two ways: whole, on the turn it
 * was attached (up to 100,000 characters, most of it unrelated to the
 * question), or as a bare filename on every turn after, so a follow-up like
 * "what does it say about refunds?" could not be answered at all.
 *
 * Instead the text is split once into sections of a few paragraphs, and each
 * turn sends only the sections that match the question. A document that fits
 * the turn's budget is still sent whole, so short files lose nothing.
 *
 * Ranking is BM25 (keyword relevance weighted by how rare each word is in the
 * document). No embeddings, no extra service, no model call.
 */

/** Sections aim for a few paragraphs: big enough to carry context, small enough to be selective. */
const TARGET_SECTION_CHARS = 1_800;
const MAX_SECTION_CHARS = 3_000;

const BM25_K1 = 1.2;
const BM25_B = 0.75;

const STOP_WORDS = new Set(
  (
    "a an the and or but of to in on at for from by with about as into is are was were be been being it its this that " +
    "these those what which who whom whose when where why how do does did can could should would will shall may might " +
    "must i me my we our you your he she they them their his her there here than then so if not no yes any all some " +
    "more most such only also just very please tell explain give show say says said file document doc pdf attached " +
    "attachment text page section part kya hai ka ki ke ko mein se aur ye yeh wo woh"
  ).split(" "),
);

/** Asks about the document as a whole, where the matching sections alone would miss the point. */
const WHOLE_DOCUMENT_RE =
  /\b(summari[sz]e|summary|overview|outline|tl;?dr|gist|main (points|ideas)|key (points|takeaways)|whole|entire|every(thing)?|all of (it|this)|translate|proofread|rewrite|review (it|this|the))\b/i;

/** Points back at an attachment, so its sections are worth sending even on a vague question. */
const DOCUMENT_REFERENCE_RE =
  /\b(document|doc|file|pdf|attachment|attached|upload(ed)?|page|section|chapter|paragraph|table|it says|mentioned|according to|in (the|this|that) (text|report|paper|contract|essay))\b/i;

export function splitIntoSections(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap(splitOversized);
  const sections: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > TARGET_SECTION_CHARS) {
      sections.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) sections.push(current);
  return sections;
}

/** A paragraph longer than a section is cut at sentence ends, or hard-cut when it has none. */
function splitOversized(paragraph: string): string[] {
  if (paragraph.length <= MAX_SECTION_CHARS) return [paragraph];
  const pieces: string[] = [];
  let rest = paragraph;
  while (rest.length > MAX_SECTION_CHARS) {
    const window = rest.slice(0, MAX_SECTION_CHARS);
    const stop = Math.max(window.lastIndexOf(". "), window.lastIndexOf("\n"), window.lastIndexOf("? "), window.lastIndexOf("! "));
    const cut = stop > TARGET_SECTION_CHARS / 2 ? stop + 1 : MAX_SECTION_CHARS;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

export function queryTerms(text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'_-]*/gu) ?? [];
  return words.filter((word) => word.length > 1 && !STOP_WORDS.has(word)).map(stem);
}

/** Folds common English endings so "refunds" finds "refund" and "billing" finds "billed". */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function isWholeDocumentRequest(question: string): boolean {
  return WHOLE_DOCUMENT_RE.test(question);
}

export function referencesDocument(question: string): boolean {
  return DOCUMENT_REFERENCE_RE.test(question);
}

/** BM25 score of every section against the question. */
export function scoreSections(sections: string[], question: string): number[] {
  const terms = [...new Set(queryTerms(question))];
  if (terms.length === 0 || sections.length === 0) return sections.map(() => 0);
  const tokenized = sections.map((section) => queryTerms(section));
  const averageLength = tokenized.reduce((sum, tokens) => sum + tokens.length, 0) / tokenized.length || 1;
  const documentFrequency = new Map<string, number>();
  for (const tokens of tokenized) {
    for (const term of new Set(tokens)) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }
  return tokenized.map((tokens) => {
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    let score = 0;
    for (const term of terms) {
      const frequency = counts.get(term) ?? 0;
      if (frequency === 0) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (sections.length - df + 0.5) / (df + 0.5));
      score +=
        (idf * frequency * (BM25_K1 + 1)) /
        (frequency + BM25_K1 * (1 - BM25_B + (BM25_B * tokens.length) / averageLength));
    }
    return score;
  });
}

export interface SectionSelection {
  /** Chosen section indexes, in document order. */
  indexes: number[];
  /** True when every section fit, so the document is being sent whole. */
  complete: boolean;
}

/**
 * The sections to send for a question, within a character budget.
 *
 * - Everything, when it fits: short documents are never cut.
 * - A whole-document request ("summarise this") gets the opening section plus
 *   sections spread evenly through the rest, so the summary covers the whole.
 * - Otherwise the best-matching sections, plus the opening one when there is
 *   room, since it usually says what the document is.
 */
export function selectSections(sections: string[], question: string, charBudget: number): SectionSelection {
  const total = sections.reduce((sum, section) => sum + section.length, 0);
  if (total <= charBudget) return { indexes: sections.map((_, index) => index), complete: true };

  const scores = scoreSections(sections, question);
  const bestScore = Math.max(0, ...scores);
  const order =
    isWholeDocumentRequest(question) || bestScore === 0
      ? spreadOrder(sections.length)
      : [
          ...scores
            .map((score, index) => ({ score, index }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score || a.index - b.index)
            .map((entry) => entry.index),
          0,
        ];

  const picked = new Set<number>();
  let used = 0;
  for (const index of order) {
    if (picked.has(index)) continue;
    const size = sections[index]!.length;
    if (picked.size > 0 && used + size > charBudget) continue;
    picked.add(index);
    used += size;
  }
  return { indexes: [...picked].sort((a, b) => a - b), complete: false };
}

/** 0, then the far end, then ever finer midpoints: an even sample in any prefix of the order. */
function spreadOrder(count: number): number[] {
  const order: number[] = [0];
  if (count > 1) order.push(count - 1);
  let parts = 2;
  while (order.length < count) {
    for (let step = 1; step < parts; step += 2) {
      const index = Math.round(((count - 1) * step) / parts);
      if (!order.includes(index)) order.push(index);
    }
    parts *= 2;
    if (parts > count * 2) break;
  }
  for (let index = 0; index < count; index += 1) if (!order.includes(index)) order.push(index);
  return order;
}

/**
 * Whether an earlier attachment is worth sending for this follow-up at all.
 * "Thanks, now write me a poem" should not drag a contract along with it.
 */
export function isRelevantFollowUp(sections: string[], question: string): boolean {
  if (sections.length === 0) return false;
  if (referencesDocument(question)) return true;
  const terms = [...new Set(queryTerms(question))];
  if (terms.length === 0) return false;
  const vocabulary = new Set(sections.flatMap((section) => queryTerms(section)));
  const matched = terms.filter((term) => vocabulary.has(term)).length;
  return matched >= Math.min(2, terms.length);
}

/** The model-facing text for a document: whole, or its chosen sections labelled by position. */
export function formatDocumentSections(
  name: string,
  sections: string[],
  selection: SectionSelection,
  options: { earlier?: boolean } = {},
): string {
  const origin = options.earlier ? `Earlier attachment: ${name}` : `Attached file: ${name}`;
  if (selection.complete) return `${origin}\n${sections.join("\n\n")}`;
  const listed = selection.indexes.map((index) => index + 1).join(", ");
  const header =
    `${origin} (sections ${listed} of ${sections.length}; only the parts relevant to this question are shown. ` +
    "If the answer needs a part that is not shown, say which part you need rather than guessing.)";
  const body = selection.indexes.map((index) => `[Section ${index + 1}]\n${sections[index]}`).join("\n\n");
  return `${header}\n\n${body}`;
}
