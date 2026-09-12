import type { ChatMessage } from "../ai/AIProvider.js";

/**
 * `detectTaskSignals().needsCode` fires on any mention of code, including
 * "what does this error mean". Deep code mode is narrower: it marks the turns
 * that should produce a substantial, runnable artifact, because those are the
 * ones worth spending extra output budget and showing a progress estimate for.
 */

const BUILD_VERB_RE =
  /\b(write|build|implement|create|generate|refactor|rewrite|port|migrate|scaffold|design|add)\b/i;

const ARTIFACT_RE =
  /\b(function|class|component|module|service|endpoint|api|route|controller|middleware|hook|script|app|server|schema|migration|test|parser|algorithm|cli|query|pipeline|wrapper)\b/i;

const LANGUAGE_RE =
  /\b(typescript|javascript|python|java|kotlin|swift|go|golang|rust|c\+\+|c#|php|ruby|sql|bash|html|css|react|node|express|mongoose|next\.?js|tailwind|django|flask|spring)\b/i;

const SCOPE_RE =
  /\b(full|complete|entire|production[- ]ready|end[- ]to[- ]end|multi[- ]file|from scratch|whole (?:app|project|file|thing))\b/i;

const DEBUG_RE = /\b(debug|stack\s*trace|traceback|failing test|reproduce|memory leak|race condition)\b/i;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** True when the turn asks for a substantial code artifact rather than a passing mention. */
export function detectDeepCodeRequest(content: string): boolean {
  const text = content.trim();
  if (text.length < 12) return false;

  const hasVerb = BUILD_VERB_RE.test(text);
  const hasArtifact = ARTIFACT_RE.test(text);
  const hasLanguage = LANGUAGE_RE.test(text);
  const words = wordCount(text);

  // "build a complete Express API" — scope words are the strongest signal.
  if (SCOPE_RE.test(text) && (hasArtifact || hasLanguage)) return true;
  // "write a TypeScript hook that…" — verb + artifact + a named technology.
  if (hasVerb && hasArtifact && hasLanguage) return true;
  // "implement a caching middleware that buckets per user" — no language named,
  // but the request is clearly for something to be built. The artifact noun is
  // what keeps this off "write a poem" and "create a study plan"; the word count
  // only filters throwaway asks like "add a test".
  if (hasVerb && hasArtifact && words >= 8) return true;
  // Substantial debugging still warrants full code in the reply.
  if (DEBUG_RE.test(text) && (hasLanguage || hasArtifact) && words > 12) return true;

  return false;
}

/**
 * Extra output contract for deep code turns. Kept as its own system message so
 * Groq's prefix cache still reuses the stable identity/protocol prefix; only
 * this tail changes between a code turn and a prose turn.
 */
export const DEEP_CODE_RULES = [
  "Deep code mode is active for this turn.",
  "Ship code that runs as written. No placeholders, no `// ...rest of implementation`, no `// TODO` standing in for logic the user asked for.",
  "Include the imports, types, and error handling the code needs to compile and survive bad input. If a function can fail, handle the failure.",
  "When the answer spans more than one file, label each fenced block with its path on the line before it.",
  "Match the conventions already visible in the user's code — naming, module style, error type, test framework. Do not introduce a new dependency unless asked, and say so plainly when one is genuinely required.",
  "Explain outside the fence, not inside it. A short note on the tradeoff you picked is worth more than line-by-line narration.",
  "State any assumption you had to make about the surrounding system in one line at the end.",
].join("\n");

export function buildDeepCodeMessage(): ChatMessage {
  return { role: "system", content: DEEP_CODE_RULES };
}
