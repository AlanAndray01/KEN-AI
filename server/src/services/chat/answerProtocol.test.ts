import { describe, expect, it } from "vitest";
import { ANSWER_PROTOCOL } from "./answerProtocol.js";
import { LANGUAGE_RULE } from "./languageRule.js";
import { buildResponsePolicyMessage, renderPolicy, detectTaskSignals } from "./responsePolicy.js";

/**
 * Ken is a general assistant. The prompt layer previously opened "You are Ken,
 * a tutor for Pakistani students (Matric, Inter, MDCAT, ECAT)", which narrowed
 * every answer in the product — a question about cooking or a stack trace was
 * still handled by a model told it was an exam tutor. These tests exist so that
 * framing cannot come back by accident.
 */
const NICHE_TERMS = [
  "tutor",
  "Matric",
  "MDCAT",
  "ECAT",
  "Pakistani",
  "syllabus",
  "exam paper",
  "board marks",
  "textbook page",
];

describe("answer protocol stays universal", () => {
  it("never assumes a country, exam, or school system", () => {
    for (const term of NICHE_TERMS) {
      expect(ANSWER_PROTOCOL.toLowerCase(), term).not.toContain(term.toLowerCase());
    }
  });

  it("states plainly that any subject is in scope", () => {
    expect(ANSWER_PROTOCOL).toContain("general-purpose assistant");
    expect(ANSWER_PROTOCOL).toMatch(/never assume the user belongs to a particular/i);
  });

  it("keeps the language rule free of exam framing", () => {
    for (const term of ["syllabus", "exam paper"]) {
      expect(LANGUAGE_RULE.toLowerCase(), term).not.toContain(term);
    }
    // The rule itself must survive: terms stay untranslated, whatever the reason.
    expect(LANGUAGE_RULE).toContain("Do not translate them");
  });

  it("carries no niche framing into a fully assembled prompt", () => {
    const prompt = buildResponsePolicyMessage("How do I braise short ribs?").content;
    for (const term of NICHE_TERMS) {
      expect(prompt.toLowerCase(), term).not.toContain(term.toLowerCase());
    }
  });

  it("keeps the honesty and anti-fabrication rules", () => {
    expect(ANSWER_PROTOCOL).toMatch(/never invent/i);
    expect(ANSWER_PROTOCOL).toMatch(/cannot confirm it/i);
  });

  it("keeps the math and no-meta-narration rules", () => {
    expect(ANSWER_PROTOCOL).toContain("$inline$");
    expect(ANSWER_PROTOCOL).toMatch(/Never narrate your plan/i);
    expect(ANSWER_PROTOCOL).toMatch(/<think>/);
    expect(ANSWER_PROTOCOL).toMatch(/work the solution out internally/i);
    expect(ANSWER_PROTOCOL).toMatch(/never put an equation/i);
    expect(ANSWER_PROTOCOL).toMatch(/Code fences are only for code/i);
  });
});

describe("answers have room to explain", () => {
  it("asks for plain-language definitions and a concrete example", () => {
    expect(ANSWER_PROTOCOL).toMatch(/define a technical term the first time/i);
    expect(ANSWER_PROTOCOL).toMatch(/concrete example/i);
  });

  it("tells every non-trivial budget to include an example when it helps", () => {
    for (const question of [
      "What is a closure?",
      "How do I set up a MERN stack?",
      "Write a comprehensive guide to JWT cookies",
    ]) {
      const policy = renderPolicy(detectTaskSignals(question));
      expect(policy, question).toMatch(/concrete example/i);
    }
  });

  it("no longer caps an ordinary answer at 80 words", () => {
    // The old ceiling left no room for a definition plus a worked example.
    const policy = renderPolicy(detectTaskSignals("What is a closure?"));
    expect(policy).not.toContain("80 words");
  });

  it("still refuses to pad small talk", () => {
    const policy = renderPolicy(detectTaskSignals("hi"));
    expect(policy).toContain("one short line");
    expect(policy).not.toMatch(/concrete example/i);
  });

  it("still forbids filler in every budget", () => {
    expect(ANSWER_PROTOCOL).toMatch(/I hope this helps/);
    expect(renderPolicy(detectTaskSignals("What is a closure?"))).toMatch(/No filler/i);
  });
});
