/**
 * Reasoning-trace filtering for streamed provider output.
 *
 * Reasoning models (DeepSeek-R1, QwQ, Qwen3, GLM and other OpenAI-compatible
 * endpoints) emit their chain of thought either as a separate `reasoning_content`
 * delta field or, more often, inline inside `content` wrapped in `<think>` tags.
 * The inline form is what leaks into the UI, because nothing downstream knows the
 * tags are special.
 *
 * The filter must be a state machine rather than a `String.replace`, because a
 * tag routinely straddles two SSE frames — `"<th"` arrives in one chunk and
 * `"ink>"` in the next. Holding back only the bytes that could still become a
 * tag keeps the visible stream flowing token-by-token with no stutter.
 */

const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

/** Alternative wrappers seen in the wild, checked after the canonical pair. */
const OPEN_ALIASES = ["<thinking>", "<reasoning>"] as const;
const CLOSE_ALIASES = ["</thinking>", "</reasoning>"] as const;

export interface FilteredChunk {
  /** Text safe to stream to the user. */
  visible: string;
  /** Chain-of-thought text removed from the visible stream. */
  reasoning: string;
}

export interface ReasoningFilter {
  /** Feeds one provider chunk through the filter. */
  push(text: string): FilteredChunk;
  /**
   * Releases anything still held back. Call once when the provider stream ends,
   * otherwise a trailing partial tag would be silently dropped.
   */
  flush(): FilteredChunk;
  /** True when the model opened a reasoning block that never closed. */
  isUnterminated(): boolean;
}

/**
 * Longest suffix of `text` that is a proper prefix of `tag`. That suffix might
 * be the start of a real tag, so it is held back until the next chunk resolves it.
 */
function heldSuffixLength(text: string, tags: readonly string[]): number {
  let longest = 0;
  for (const tag of tags) {
    const max = Math.min(text.length, tag.length - 1);
    for (let size = max; size > longest; size -= 1) {
      if (text.endsWith(tag.slice(0, size))) {
        longest = size;
        break;
      }
    }
  }
  return longest;
}

/** Earliest occurrence of any tag, and which one matched. */
function firstIndexOf(
  text: string,
  tags: readonly string[],
): { index: number; tag: string } | null {
  let best: { index: number; tag: string } | null = null;
  for (const tag of tags) {
    const index = text.indexOf(tag);
    if (index !== -1 && (best === null || index < best.index)) {
      best = { index, tag };
    }
  }
  return best;
}

export function createReasoningFilter(): ReasoningFilter {
  const openTags = [OPEN_TAG, ...OPEN_ALIASES];
  const closeTags = [CLOSE_TAG, ...CLOSE_ALIASES];

  let pending = "";
  let inReasoning = false;

  function drain(final: boolean): FilteredChunk {
    let visible = "";
    let reasoning = "";

    for (;;) {
      if (!inReasoning) {
        const open = firstIndexOf(pending, openTags);
        if (open) {
          visible += pending.slice(0, open.index);
          pending = pending.slice(open.index + open.tag.length);
          inReasoning = true;
          continue;
        }
        // No complete tag. Hold back only what could still become one.
        const held = final ? 0 : heldSuffixLength(pending, openTags);
        visible += pending.slice(0, pending.length - held);
        pending = pending.slice(pending.length - held);
        break;
      }

      const close = firstIndexOf(pending, closeTags);
      if (close) {
        reasoning += pending.slice(0, close.index);
        pending = pending.slice(close.index + close.tag.length);
        inReasoning = false;
        continue;
      }
      const held = final ? 0 : heldSuffixLength(pending, closeTags);
      reasoning += pending.slice(0, pending.length - held);
      pending = pending.slice(pending.length - held);
      break;
    }

    return { visible, reasoning };
  }

  return {
    push(text: string): FilteredChunk {
      if (!text) return { visible: "", reasoning: "" };
      pending += text;
      return drain(false);
    },

    flush(): FilteredChunk {
      const result = drain(true);
      pending = "";
      return result;
    },

    isUnterminated(): boolean {
      return inReasoning;
    },
  };
}

/**
 * Non-streaming equivalent, for the `generate` path where the whole body arrives
 * at once. Leading whitespace left behind by a stripped block is trimmed so the
 * answer does not start with a blank line.
 */
export function stripReasoning(content: string): FilteredChunk {
  const filter = createReasoningFilter();
  const first = filter.push(content);
  const rest = filter.flush();
  return {
    visible: (first.visible + rest.visible).replace(/^\s+/, ""),
    reasoning: (first.reasoning + rest.reasoning).trim(),
  };
}
