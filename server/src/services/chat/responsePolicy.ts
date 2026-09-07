import type { ChatMessage } from "../ai/AIProvider.js";
import { buildKenIdentity } from "./identity.js";
import { LANGUAGE_RULE } from "./languageRule.js";
import { ANSWER_PROTOCOL } from "./answerProtocol.js";

export type ReplyBudget = "minimal" | "short" | "medium" | "long";

export interface TaskSignals {
  budget: ReplyBudget;
  needsMath: boolean;
  needsCode: boolean;
  needsQuotes: boolean;
  needsStructure: boolean;
  needsInteractive: boolean;
}

const MATH_RE =
  /\b(equation|formula|integral|derivative|matrix|theorem|prove|calculate|compute|algebra|calculus|probability|statistic|latex|sqrt|frac|quadratic|differentiate|integrate|polynomial|solve for)\b|[0-9]+\s*[+\-*/=×÷^]|[∑∫√πθλμσ∞≈≠≤≥±]|\$\$|\\\(|\\\[/i;

const CODE_RE =
  /\b(code|coding|program(?:ming)?|python|javascript|typescript|java\b|c\+\+|sql|regex|algorithm|debug|stack\s*trace|refactor|compile|function|endpoint)\b/i;

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

/** True when the turn is small talk rather than a real question. */
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
  const needsCode = CODE_RE.test(text);
  const needsQuotes = QUOTE_RE.test(text);
  const needsInteractive = INTERACTIVE_RE.test(text);
  const needsStructure = STRUCTURE_RE.test(text) || needsInteractive || needsCode || words > 40;
  const wantsLong = LONG_RE.test(text);

  // Small talk is decided first: a greeting must never inherit a word budget.
  if (isTrivialTurn(text) && !needsMath && !needsInteractive && !needsCode) {
    return {
      budget: "minimal",
      needsMath: false,
      needsCode: false,
      needsQuotes: false,
      needsStructure: false,
      needsInteractive: false,
    };
  }

  let budget: ReplyBudget = "short";
  if (wantsLong) budget = "long";
  else if (needsStructure || needsMath || needsCode || words > 18) budget = "medium";

  return { budget, needsMath, needsCode, needsQuotes, needsStructure, needsInteractive };
}

/** Short factual turns and greetings should not wait on a thinking phase. */
export function isLowThinkingTurn(signals: TaskSignals): boolean {
  return signals.budget === "minimal" || signals.budget === "short";
}

/**
 * Decode ceilings. GPT-OSS counts reasoning tokens against this budget, so
 * even a greeting needs more than a handful of tokens after `reasoning_effort`
 * is set to `low`.
 */
export function replyMaxTokens(budget: ReplyBudget): number {
  switch (budget) {
    case "minimal":
      return 256;
    case "short":
      return 1_024;
    case "medium":
      return 2_048;
    case "long":
      return 4_096;
  }
}

/**
 * Two system messages so Groq's prefix cache can reuse identity + protocol
 * across turns. The per-turn policy changes with the question, so it cannot
 * sit in the same string as the stable prefix.
 */
export function buildResponsePolicyMessages(
  content: string,
  options?: { skipProtocol?: boolean; modelName?: string },
): ChatMessage[] {
  const signals = detectTaskSignals(content);
  const stable = [buildKenIdentity(options?.modelName ?? "the selected model"), LANGUAGE_RULE];
  // Greetings skip the long protocol so prefill stays tiny and the first token
  // can land in under a second.
  if (!options?.skipProtocol && signals.budget !== "minimal") stable.push(ANSWER_PROTOCOL);
  return [
    { role: "system", content: stable.join("\n\n") },
    { role: "system", content: renderPolicy(signals) },
  ];
}

export function buildResponsePolicyMessage(
  content: string,
  options?: { skipProtocol?: boolean },
): ChatMessage {
  const messages = buildResponsePolicyMessages(content, options);
  return {
    role: "system",
    content: messages.map((message) => message.content).join("\n\n"),
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

  // These are ceilings against padding, not targets to hit. They were tightened
  // once to stop the model writing 80 words for "hi", and the small-talk branch
  // above now handles that case on its own — so a real question is allowed the
  // room to define its terms and carry a worked example, which is the whole
  // point of an explanation.
  const length =
    signals.budget === "short"
      ? "Short: lead with the answer, then explain it. Around 150 words is usually right; go over only if an example, list, or formula genuinely needs it. No filler."
      : signals.budget === "medium"
        ? "Medium: answer fully and show an example. Around 300 words is usually right. Cut repetition, not substance."
        : "Long: the user asked for depth, so give it - cover the parts that matter and work through examples. Still no padding or repetition.";

  const formatBits = [
    "Use a heading only when there are two or more distinct sections.",
    "Use a list only for steps, options, or ranked items.",
    "Use a blockquote (>) only for a citation or quoted wording.",
    "Put code in a fenced block tagged with its language. Never put prose steps or equations in that fence.",
    "Explain any technical term in plain words the first time it appears, and include a short concrete example whenever one would make the idea clearer.",
  ];
  if (signals.needsMath) {
    formatBits.push(
      "This turn needs math: write every equation as $inline$ or $$display$$ LaTeX so it renders. Do not leave TeX commands in ordinary sentences. Each $$ fence sits alone on its own line, with a blank line before the opening fence and after the closing one.",
    );
  } else {
    formatBits.push("Skip LaTeX unless an equation actually appears.");
  }
  if (signals.needsCode) {
    formatBits.push(
      "This turn needs code: show a complete, copyable snippet in a language-tagged fence, and keep the explanation outside that fence.",
    );
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
