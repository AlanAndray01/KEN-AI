import { stripReasoning } from "@Ken/shared";
import { logger } from "../../config/logger.js";
import { toSafeError } from "../../utils/redact.js";
import { aiProviderManager } from "../ai/AIProviderManager.js";

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

/*
 * Model-written titles.
 *
 * `titleFromContent` above still runs first and is what the sidebar shows the
 * instant a chat is created - it is synchronous and never fails. It is also
 * dumb: it title-cases the first few non-stop-words of whatever was typed, so
 * "can u explain photosynthesis yaar" becomes "Can U Explain Photosynthesis".
 * Once the first answer exists there is enough material to ask the model for a
 * real name, and that replaces the placeholder.
 */

const TITLE_INSTRUCTION = `Name this chat thread.

Reply with the title and nothing else: no quotes, no "Title:" prefix, no final period, no emoji, no markdown.
Three to six words, capitalised like a headline.
Name the subject that was discussed, not the act of asking - "Quadratic Equation Roots", never "User Needs Help With Math".
Write it in the language the user wrote in.`;

/** Enough of each turn to identify the subject; the rest is wasted prefill. */
const MAX_SOURCE_CHARS = 600;
const MAX_TITLE_CHARS = 60;
const MAX_TITLE_WORDS = 8;
/** A title is a handful of words, so a chatty model gets cut off rather than waited on. */
const TITLE_MAX_TOKENS = 32;

/**
 * Trims a model's answer down to something that belongs in a sidebar.
 *
 * Small models ignore parts of the instruction routinely - they wrap the title
 * in quotes, prefix it with "Title:", bold it, or answer in a full sentence.
 * Returning null on anything unusable leaves the placeholder in place, which is
 * always better than writing junk into the sidebar.
 */
export function sanitizeTitle(raw: string): string | null {
  const visible = stripReasoning(raw ?? "").visible;
  const firstLine = visible
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("```"));
  if (!firstLine) return null;

  let title = firstLine
    .replace(/^(?:chat\s+|conversation\s+)?title\s*[:\-\u2013]\s*/i, "")
    .replace(/^[\s"'`*_\u201c\u201d\u2018\u2019]+/, "")
    .replace(/[\s"'`*_\u201c\u201d\u2018\u2019]+$/, "")
    .replace(/[.,:;!?\u3002\uff01\uff1f]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return null;

  const words = title.split(" ");
  if (words.length > MAX_TITLE_WORDS) title = words.slice(0, MAX_TITLE_WORDS).join(" ");
  if (title.length > MAX_TITLE_CHARS) {
    title = title.slice(0, MAX_TITLE_CHARS).replace(/\s+\S*$/, "").trim();
  }
  return title.length >= 2 ? title : null;
}

/**
 * Asks the conversation's own model for a title. Returns null on any failure -
 * a naming call must never take a delivered answer down with it.
 */
export async function generateChatTitle(input: {
  userId: string;
  providerId: string;
  modelId: string;
  userMessage: string;
  assistantReply: string;
}): Promise<string | null> {
  try {
    const response = await aiProviderManager.generate({
      providerId: input.providerId,
      modelId: input.modelId,
      userId: input.userId,
      maxTokens: TITLE_MAX_TOKENS,
      // Naming is the app's idea, not the user's: it must not spend their quota.
      skipQuota: true,
      messages: [
        { role: "system", content: TITLE_INSTRUCTION },
        {
          role: "user",
          content: `User: ${clipSource(input.userMessage)}\n\nAssistant: ${clipSource(input.assistantReply)}`,
        },
      ],
    });
    return sanitizeTitle(response.content);
  } catch (error) {
    logger.warn({ err: toSafeError(error), providerId: input.providerId }, "chat title generation failed");
    return null;
  }
}

function clipSource(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= MAX_SOURCE_CHARS ? compact : `${compact.slice(0, MAX_SOURCE_CHARS)}…`;
}
