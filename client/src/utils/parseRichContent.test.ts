import { describe, expect, it } from "vitest";
import { parseRichContent } from "./parseRichContent";

const quiz = `[QUIZ]
Q: Acceleration is a change in
A) mass
B) velocity
C) time
D) temperature
Correct: B
Explanation: a = Δv / Δt
---
[/QUIZ]`;

describe("parseRichContent", () => {
  it("parses a quiz block and drops leftover tag prose", () => {
    const parsed = parseRichContent(quiz);
    expect(parsed.text).toBe("");
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0]).toMatchObject({
      type: "quiz",
      questions: [
        {
          question: "Acceleration is a change in",
          options: ["mass", "velocity", "time", "temperature"],
          correctIndex: 1,
          explanation: "a = Δv / Δt",
        },
      ],
    });
  });

  it("parses flash cards, mind maps, and revision units", () => {
    const parsed = parseRichContent(`
[FLASHCARDS]
Q: Force
A: A push or a pull
---
[/FLASHCARDS]

[MINDMAP:Newton]
Laws
  First
    Inertia
[/MINDMAP]

[QUICKREVISION]
Unit: Motion
- Displacement is a vector
---
[/QUICKREVISION]
`);
    expect(parsed.blocks.map((block) => block.type)).toEqual(["flashcards", "mindmap", "revision"]);
  });

  it("does not invent lecture or PDF URLs", () => {
    const parsed = parseRichContent("See this: [LECTURE:Biology:10] [PDF:Biology:10]");
    expect(parsed.blocks).toEqual([
      {
        type: "unavailable",
        message: "Ken does not host lecture videos or PDF notes. Those tags were ignored.",
      },
    ]);
    expect(JSON.stringify(parsed)).not.toMatch(/cdn\.creativetaleem/i);
  });
});
