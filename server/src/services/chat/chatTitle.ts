const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "for",
  "in",
  "on",
  "is",
  "it",
  "this",
  "that",
  "with",
  "from",
  "so",
  "hey",
  "i",
  "me",
  "my",
  "you",
  "your",
  "we",
  "us",
]);

export function titleFromContent(content: string): string {
  const words = content
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return "New chat";

  const meaningful = words.filter((word) => !STOP_WORDS.has(word.toLowerCase()));
  const selected = (meaningful.length >= 3 ? meaningful : words).slice(0, 5);
  return selected.map(titleCaseWord).join(" ");
}

function titleCaseWord(word: string): string {
  if (/^[A-Z0-9]{2,}$/.test(word)) return word;
  if (word.length <= 1) return word.toUpperCase();
  return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
}
