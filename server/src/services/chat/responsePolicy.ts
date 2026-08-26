import type { ChatMessage } from "../ai/AIProvider.js";
import { TUTOR_PROTOCOL } from "./tutorProtocol.js";

export type ReplyBudget = "minimal" | "short" | "medium" | "long";

export interface TaskSignals {
  budget: ReplyBudget;
  needsMath: boolean;
  needsQuotes: boolean;
  needsStructure: boolean;
  needsInteractive: boolean;
}

const MATH_RE =
  /\b(equation|formula|integral|derivative|matrix|theorem|prove|calculate|compute|algebra|calculus|probability|statistic|latex|sqrt|frac)\b|[0-9]+\s*[+\-*/=×÷^]|[∑∫√πθλμσ∞≈≠≤≥±]|\$\$|\\\(|\\\[/i;

const QUOTE_RE = /\b(quote|citation|cited|according to|said that)\b|[“”«»]|"[^"]{8,}"/;

const STRUCTURE_RE =
  /\b(steps?|guide|tutorial|compare|vs\.?|versus|pros and cons|outline|plan|checklist|how (do|to)|explain)\b/i;

const LONG_RE =
  /\b(detailed|in depth|in-depth|comprehensive|full (?:guide|write-?up)|long answer|essay|everything about)\b/i;

const INTERACTIVE_RE =
  /\b(quiz|mcqs?|flash\s*cards?|cards banao|mind\s*map|quick revision|key points|summary)\b/i;

/**
 * Greetings, acknowledgements and sign-offs. These carry no question, so any
 * length budget above a line or two produces the "80 words for hi" failure:
 * the model has nothing to say but is told to fill a word count.
 */
const TRIVIAL_RE = new RegExp(
  "^(" +
    [
      "hi+", "hey+", "hello+", "yo",
      // Salam family: salam / assalam u alaikum / assalamu alaikum / walaikum salam.
      "(wa?\\s*)?a?s+al[ae]*m(\\s*u?\\s*a?laikum)?",
      "w?a?laikum(\\s*a?s*al[ae]*m)?",
      "aoa", "slm",
      "good\\s*(morning|afternoon|evening|night)",
      "thanks?(\\s*you)?", "thank\\s*u", "shukriy?a", "tysm", "ty",
      "ok(ay)?", "k", "acha+", "theek(\\s*hai)?", "sahi", "got\\s*it",
      "nice", "great", "cool", "perfect", "awesome",
      "bye+", "goodbye", "khuda\\s*hafiz", "allah\\s*hafiz",
      "hmm+", "yes", "yeah", "yup", "no", "nope", "haan?", "nahi+",
    ].join("|") +
    ")[\\s!.,?]*$",
  "i",
);

/** Emoji-only turns are small talk too, and never match a word pattern. */
const EMOJI_ONLY_RE = /^[\p{Extended_Pictographic}\p{Emoji_Component}\s!.,?]+$/u;

/** True when the turn is small talk rather than a request for teaching. */
export function isTrivialTurn(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 40) return false;
  // Strip trailing emoji so "hey 👋" is still recognised as a bare greeting.
  const words = trimmed.replace(/[\p{Extended_Pictographic}\p{Emoji_Component}]/gu, "").trim();
  if (!words) return EMOJI_ONLY_RE.test(trimmed);
  return TRIVIAL_RE.test(words);
}

/**
 * Prompt-side teams that shape one streamed reply. This is not a second model
 * call and does not fine-tune hosted weights.
 */
export function detectTaskSignals(content: string): TaskSignals {
  const text = content.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const needsMath = MATH_RE.test(text);
  const needsQuotes = QUOTE_RE.test(text);
  const needsInteractive = INTERACTIVE_RE.test(text);
  const needsStructure = STRUCTURE_RE.test(text) || needsInteractive || words > 40;
  const wantsLong = LONG_RE.test(text);

  // Small talk is decided first: a greeting must never inherit a word budget.
  if (isTrivialTurn(text) && !needsMath && !needsInteractive) {
    return {
      budget: "minimal",
      needsMath: false,
      needsQuotes: false,
      needsStructure: false,
      needsInteractive: false,
    };
  }

  let budget: ReplyBudget = "short";
  if (wantsLong) budget = "long";
  else if (needsStructure || needsMath || words > 18) budget = "medium";

  return { budget, needsMath, needsQuotes, needsStructure, needsInteractive };
}

export function buildResponsePolicyMessage(
  content: string,
  options?: { skipTutor?: boolean },
): ChatMessage {
  const signals = detectTaskSignals(content);
  const policy = renderPolicy(signals);
  return {
    role: "system",
    content: options?.skipTutor ? policy : `${TUTOR_PROTOCOL}\n\n${policy}`,
  };
}

export function renderPolicy(signals: TaskSignals): string {
  // Small talk gets no scaffolding at all. Sending the Style/Format/Check frame
  // for a greeting is what pushed the model into padding a one-line reply, and
  // into narrating those stage names back to the user.
  if (signals.budget === "minimal") {
    return [
      "Ken reply policy (one streamed pass).",
      "This turn is small talk, not a question. Reply in one short line and stop.",
      "No headings, no lists, no bold, no LaTeX, no interactive blocks.",
      "Do not offer a menu of subjects and do not explain what you can do unless asked.",
    ].join("\n");
  }

  const length =
    signals.budget === "short"
      ? "Short: lead with the answer. About 80 words unless a list or formula needs more. No filler."
      : signals.budget === "medium"
        ? "Medium: about 180 words unless the user asked for more. Cut repetition."
        : "Longer only because the user asked for depth. Still no padding. Prefer under 350 words.";

  const formatBits = [
    "Use a heading only when there are two or more distinct sections.",
    "Use a list only for steps, options, or ranked items.",
    "Use a blockquote (>) only for a citation or quoted wording.",
  ];
  if (signals.needsMath) {
    formatBits.push("This turn needs math: write it as $inline$ or $$display$$ LaTeX, not unicode approximations.");
  } else {
    formatBits.push("Skip LaTeX unless an equation actually appears.");
  }
  if (signals.needsQuotes) {
    formatBits.push("Preserve quoted wording in a blockquote or quotation marks.");
  }
  if (signals.needsInteractive) {
    formatBits.push("The user asked for an interactive block. Emit the matching tag block and nothing extra on tag lines.");
  }

  return [
    "Ken reply policy (one streamed pass; do not wait for extra agents).",
    `Style: ${length}`,
    `Format: ${formatBits.join(" ")}`,
    "Check before you stop: if an equation, heading, quote, or list is missing and the question needed it, add only that. Do not add unused headings, bullets, or bold.",
  ].join("\n");
}
