import type { ChatToolId } from "@Ken/shared";

/**
 * Detects a request to *create* a picture, so the image tool can run without
 * the user first finding and toggling it.
 *
 * Deliberately conservative in one direction: a false positive spends a real
 * image generation and attaches a picture nobody asked for, so the verb has to
 * be an actual creation verb aimed at an actual image noun. "What is in this
 * image?" and "describe the diagram" are questions *about* an image and must
 * not trigger it — those are vision turns, which the attachment router already
 * handles.
 */

/** Creation verbs, in the imperative or "can you ..." forms people actually type. */
const CREATE_VERB = String.raw`(?:draw|sketch|paint|generate|create|make|render|design|produce|illustrate|imagine|visuali[sz]e)`;

/** What is being created. Kept narrow so "make a plan" or "draw a conclusion" do not match. */
const IMAGE_NOUN = String.raw`(?:image|images|picture|pictures|pic|pics|photo|photos|photograph|drawing|sketch|painting|illustration|artwork|art|logo|icon|poster|wallpaper|portrait|avatar|render|diagram|graphic|graphics)`;

/**
 * Verb ... noun, allowing the usual filler in between ("generate me a quick
 * picture of", "draw an image showing"). Bounded so the two halves have to
 * belong to the same clause rather than being matched across a paragraph.
 */
const VERB_THEN_NOUN = new RegExp(String.raw`\b${CREATE_VERB}\b[^.!?\n]{0,40}?\b${IMAGE_NOUN}\b`, "i");

/**
 * Objects that make an otherwise visual verb figurative: "draw a conclusion",
 * "draw a parallel", "draw a distinction". Without this the bare-verb rule
 * below treats any "draw a ..." as a picture request.
 */
const FIGURATIVE_OBJECT = String.raw`(?:conclusion|conclusions|comparison|comparisons|distinction|distinctions|parallel|parallels|analogy|analogies|inference|inferences|line|lines|blank|card|straw|salary|crowd)`;

/**
 * "draw a cat", "paint a sunset" — a creation verb with no image noun at all.
 * Only the unambiguously visual verbs qualify here, because "create", "make",
 * "generate", "design" and "produce" all have common non-visual objects
 * ("create a table", "make a list", "generate a password").
 */
const VISUAL_VERB_ALONE = new RegExp(
  String.raw`\b(?:draw|sketch|paint|illustrate)\b\s+(?:me\s+)?(?:a|an|the|some|two|three)\s+(?!${FIGURATIVE_OBJECT}\b)`,
  "i",
);

/** "an image of a cat", "a logo for my shop" — noun-led phrasing with no verb. */
const NOUN_LED = new RegExp(String.raw`\b(?:a|an|another)\s+${IMAGE_NOUN}\s+(?:of|for|with|showing)\b`, "i");

/**
 * Phrases that talk about an image the user already has. Checked first, because
 * "describe this picture" contains an image noun and would otherwise look like
 * a creation request under the noun-led rule.
 */
const ABOUT_EXISTING = /\b(?:this|that|these|those|the attached|my|uploaded|above)\s+(?:\w+\s+){0,2}?(?:image|picture|pic|photo|photograph|drawing|diagram|screenshot|graphic)\b/i;

const ANALYSIS_VERB = /\b(?:describe|explain|analy[sz]e|read|identify|caption|translate|extract|summari[sz]e|what(?:'s| is| are)?)\b/i;

export function detectImageRequest(content: string): boolean {
  const text = content.trim();
  if (!text) return false;
  // Discussion, quoted examples and negation must not spend image quota.
  if (/\b(?:do not|don't|dont|never|avoid|without)\b[^.!?\n]{0,60}\b(?:generate|create|make|draw|paint|render|image|picture)\b/i.test(text)) return false;
  if (/\b(?:how (?:can|do|would|to)|explain how|teach me|show me how|write (?:a |the )?(?:code|function|script))\b/i.test(text)) return false;
  if (/\b(?:mat|nahi|nahin)\b[^.!?\n]{0,30}\b(?:banao|banana|banaye|karo)\b/i.test(text)) return false;
  if (/\b(?:image|picture|tasveer|taswir|photo)\b[^.!?\n]{0,40}\b(?:banao|bana do|bana dein|banaye)\b/i.test(text)) return true;
  const unquoted = text.replace(/```[\s\S]*?```|`[^`]*`|"[^"]*"|“[^”]*”/g, "");
  // A question about an existing image is a vision turn, not a creation turn.
  if (ABOUT_EXISTING.test(text) && ANALYSIS_VERB.test(text)) return false;
  return VERB_THEN_NOUN.test(unquoted) || VISUAL_VERB_ALONE.test(unquoted) || NOUN_LED.test(unquoted);
}

/**
 * The tools this turn should run. Adds `image_generation` when the text is a
 * creation request, whether or not the user toggled the tool. A pinned model
 * still generates the picture — Auto is not required for Flux to fire.
 */
export function withImageGenerationTool(
  content: string,
  enabledTools?: readonly ChatToolId[],
): ChatToolId[] | undefined {
  const tools = [...(enabledTools ?? [])];
  if (detectImageRequest(content) && !tools.includes("image_generation")) {
    tools.push("image_generation");
  }
  return tools.length > 0 ? tools : undefined;
}

/** Flux (or Auto image) always runs the image tool, including a pinned "hello". */
export function ensureImageGenerationTool(enabledTools?: readonly ChatToolId[]): ChatToolId[] {
  const tools = [...(enabledTools ?? [])];
  if (!tools.includes("image_generation")) tools.push("image_generation");
  return tools;
}
