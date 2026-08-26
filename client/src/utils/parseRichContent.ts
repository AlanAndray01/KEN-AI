export type FlashCard = { front: string; back: string };

export type QuizQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export type MindMapNode = { text: string; level: number };

export type RevisionUnit = { title: string; points: string[] };

export type RichBlock =
  | { type: "flashcards"; title: string; cards: FlashCard[] }
  | { type: "quiz"; title: string; questions: QuizQuestion[] }
  | { type: "mindmap"; title: string; nodes: MindMapNode[] }
  | { type: "revision"; title: string; units: RevisionUnit[] }
  | { type: "unavailable"; message: string };

export interface ParsedRichContent {
  text: string;
  blocks: RichBlock[];
}

const LECTURE_RE = /\[LECTURE\s*:\s*[^:\]]+\s*:\s*\d+\s*]/gi;
const PDF_RE = /\[PDF\s*:\s*[^:\]]+\s*:\s*\d+\s*]/gi;
const FLASH_RE = /\[FLASHCARDS?\s*]([\s\S]*?)\[\/FLASHCARDS?\s*]/gi;
const QUIZ_RE = /\[QUIZ\s*]([\s\S]*?)\[\/QUIZ\s*]/gi;
const MIND_RE = /\[MINDMAP\s*:\s*([^\]]*)]([\s\S]*?)\[\/MINDMAP\s*]/gi;
const REVISION_RE = /\[QUICKREVISION\s*]([\s\S]*?)\[\/QUICKREVISION\s*]/gi;

export function parseRichContent(response: string): ParsedRichContent {
  const blocks: RichBlock[] = [];
  let cleaned = response
    .replace(
      /```[a-zA-Z]*\r?\n([\s\S]*?\[(?:QUIZ|FLASHCARDS?|MINDMAP|QUICKREVISION)[\s\S]*?)```/gi,
      "$1",
    )
    .trim();

  const hadCdnTags = LECTURE_RE.test(cleaned) || PDF_RE.test(cleaned);
  LECTURE_RE.lastIndex = 0;
  PDF_RE.lastIndex = 0;
  cleaned = cleaned.replace(LECTURE_RE, "").replace(PDF_RE, "");
  if (hadCdnTags) {
    blocks.push({
      type: "unavailable",
      message: "Ken does not host lecture videos or PDF notes. Those tags were ignored.",
    });
  }

  cleaned = replaceAll(cleaned, FLASH_RE, (inner) => {
    const cards = parseFlashCards(inner.trim());
    if (cards.length === 0) return null;
    blocks.push({ type: "flashcards", title: `Flash cards (${cards.length})`, cards });
    return "";
  });

  cleaned = replaceAll(cleaned, QUIZ_RE, (inner) => {
    const questions = parseQuiz(inner.trim());
    if (questions.length === 0) return null;
    blocks.push({ type: "quiz", title: `Quiz (${questions.length} MCQ)`, questions });
    return "";
  });

  cleaned = replaceAll(cleaned, MIND_RE, (title, body) => {
    const nodes = parseMindMap(body);
    if (nodes.length === 0) return null;
    blocks.push({ type: "mindmap", title: title.trim() || "Mind map", nodes });
    return "";
  });

  cleaned = replaceAll(cleaned, REVISION_RE, (inner) => {
    const units = parseRevision(inner.trim());
    if (units.length === 0) return null;
    blocks.push({ type: "revision", title: `Revision (${units.length} units)`, units });
    return "";
  });

  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  const interactive = blocks.some((block) => block.type !== "unavailable");
  const words = cleaned.split(/\s+/).filter(Boolean).length;
  if (interactive && words < 30) cleaned = "";

  return { text: cleaned, blocks };
}

function replaceAll(
  source: string,
  pattern: RegExp,
  onMatch: (...groups: string[]) => string | null,
): string {
  let next = source;
  for (const match of source.matchAll(pattern)) {
    const replacement = onMatch(...match.slice(1));
    if (replacement === null) continue;
    next = next.replace(match[0], replacement);
  }
  return next;
}

function parseFlashCards(text: string): FlashCard[] {
  const cards: FlashCard[] = [];
  text.replace(/\\n/g, "\n").split(/---+/).forEach((block) => {
    let front = "";
    let back = "";
    for (const line of block.trim().split("\n")) {
      const trimmed = line.trim();
      if (/^Q:/i.test(trimmed)) front = trimmed.replace(/^Q:\s*/i, "").trim();
      if (/^A:/i.test(trimmed)) back = trimmed.replace(/^A:\s*/i, "").trim();
    }
    if (front && back) cards.push({ front, back });
  });
  return cards;
}

function parseQuiz(text: string): QuizQuestion[] {
  const normalized = text
    .replace(/\\n/g, "\n")
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/_{1,2}([^_]+)_{1,2}/g, "$1");

  const dashed = normalized.split(/---+/).map((block) => block.trim()).filter(Boolean);
  const numbered = normalized
    .split(/(?=^\s*(?:Q\s*\d+[.):]|(?:Question\s*)?\d+[.)]\s))/im)
    .map((block) => block.trim())
    .filter(Boolean);
  const chunks = dashed.length > 1 ? dashed : numbered.length > 1 ? numbered : dashed;

  return chunks.flatMap((block) => {
    let question = "";
    const options: string[] = [];
    let correctIndex = -1;
    let explanation = "";
    for (const line of block.split("\n")) {
      const trimmed = line.trim();
      if (/^Q:/i.test(trimmed)) {
        question = trimmed.slice(2).trim();
      } else if (/^(?:Q\s*)?\d+[.)]\s+.+/i.test(trimmed) && !question) {
        question = trimmed.replace(/^(?:Q\s*)?\d+[.)]\s*/i, "").trim();
      } else if (/^\(?[A-Da-d][).]\s?/.test(trimmed)) {
        const option = trimmed.replace(/^\(?[A-Da-d][).]\s*/, "").trim();
        if (option) options.push(option);
      } else if (/^Correct:/i.test(trimmed)) {
        const letter = trimmed.slice(8).replace(/[^A-Da-d]/g, "").toUpperCase();
        correctIndex = letterIndex(letter);
      } else if (/^(?:correct\s+)?answer\s*:/i.test(trimmed) && correctIndex < 0) {
        const letter = trimmed.replace(/^(?:correct\s+)?answer\s*:\s*/i, "").replace(/[^A-Da-d]/g, "").toUpperCase();
        correctIndex = letterIndex(letter);
      } else if (/^Explanation:/i.test(trimmed)) {
        explanation = trimmed.slice(12).trim();
      }
    }
    if (!question || options.length < 2 || correctIndex < 0) return [];
    return [{ question, options, correctIndex, explanation }];
  });
}

function letterIndex(letter: string): number {
  const first = letter.charAt(0);
  if (first === "A") return 0;
  if (first === "B") return 1;
  if (first === "C") return 2;
  if (first === "D") return 3;
  return -1;
}

function parseMindMap(text: string): MindMapNode[] {
  return text
    .replace(/\\n/g, "\n")
    .split("\n")
    .flatMap((line) => {
      if (!line.trim()) return [];
      const level = Math.floor((line.length - line.trimStart().length) / 2);
      return [{ text: line.trim(), level }];
    });
}

function parseRevision(text: string): RevisionUnit[] {
  const units: RevisionUnit[] = [];
  text.replace(/\\n/g, "\n").split(/---+/).forEach((block) => {
    let title = "";
    const points: string[] = [];
    for (const line of block.trim().split("\n")) {
      const trimmed = line.trim();
      if (/^Unit:/i.test(trimmed)) title = trimmed.replace(/^Unit:\s*/i, "").trim();
      else if (/^Topic:/i.test(trimmed)) title = trimmed.replace(/^Topic:\s*/i, "").trim();
      else if (trimmed.startsWith("- ")) points.push(trimmed.slice(2).trim());
      else if (trimmed.startsWith("-")) points.push(trimmed.slice(1).trim());
      else if (trimmed.startsWith("* ")) points.push(trimmed.slice(2).trim());
      else if (trimmed.startsWith("• ")) points.push(trimmed.slice(2).trim());
      else if (trimmed && !title) title = trimmed;
    }
    if (title && points.length > 0) units.push({ title, points });
  });
  return units;
}
