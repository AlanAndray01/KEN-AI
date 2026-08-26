/**
 * Pre-token indicator for an assistant turn that has started but has not yet
 * streamed any text.
 *
 * A rotating one-word label plus the dot wave. An earlier version cycled
 * "Style → Format → Check" on a timer with no connection to the request, which
 * invented analysis stages that never ran. The words here are deliberately not
 * that: every one of them is a synonym for "still working", so the label names
 * the single state the client can actually observe and never implies a step the
 * model is on. That is the line this component has to keep - playful wording is
 * fine, fabricated progress is not.
 *
 * Both the word and the dots are aria-hidden. The status keeps its fixed
 * accessible name, so a screen reader announces "Generating response" once
 * instead of re-announcing every time the word changes.
 *
 * Under prefers-reduced-motion the indicator keeps animating, in opacity and
 * colour only - see the note beside the reduced-motion rules in index.css for
 * why a frozen progress indicator is the worse outcome.
 */

import { useEffect, useState } from "react";

/** Synonyms for "working on it". Nothing here claims a stage. */
const WAIT_WORDS = [
  "Thinking",
  "Noodling",
  "Doodling",
  "Pondering",
  "Mulling",
  "Percolating",
  "Cooking",
  "Tinkering",
] as const;

/** Slow enough to read the word, quick enough that a long wait keeps moving. */
const WORD_MS = 2400;

export function ThinkingPipeline() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // Rotation runs for everyone. It was gated on prefers-reduced-motion, which
    // pinned the word to "Thinking" forever on any machine with OS animations
    // switched off — the indicator then had no moving part at all. A word swap
    // cross-fades in place and never travels, so it is within what "reduce"
    // asks for; the CSS handles the rest.
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % WAIT_WORDS.length);
    }, WORD_MS);
    return () => window.clearInterval(id);
  }, []);

  const word = WAIT_WORDS[index] ?? WAIT_WORDS[0];

  return (
    <div
      className="thinking-pipeline"
      role="status"
      aria-live="polite"
      aria-label="Generating response"
    >
      {/* `key` remounts the span so each new word fades in on its own. */}
      <span className="thinking-word" key={word} aria-hidden="true">
        {word}
      </span>
      <span className="thinking-dots" aria-hidden="true">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </span>
    </div>
  );
}
