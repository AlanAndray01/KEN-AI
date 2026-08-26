import { describe, expect, it } from "vitest";
import { buildResponsePolicyMessage, detectTaskSignals } from "./responsePolicy.js";

describe("detectTaskSignals", () => {
  it("gives small talk the minimal budget, not a word count", () => {
    // A greeting carries no question. Anything above `minimal` told the model to
    // pad a one-line reply up to a target length.
    for (const greeting of ["hi", "Hey", "hello!", "Assalam u Alaikum", "aoa", "thanks", "shukriya", "ok"]) {
      expect(detectTaskSignals(greeting).budget, greeting).toBe("minimal");
    }
  });

  it("keeps a tiny real question short rather than minimal", () => {
    expect(detectTaskSignals("What is Ken?").budget).toBe("short");
    expect(detectTaskSignals("What is Ken?").needsMath).toBe(false);
  });

  it("does not treat a greeting that carries a real request as small talk", () => {
    expect(detectTaskSignals("hi, explain Newton's second law").budget).not.toBe("minimal");
    expect(detectTaskSignals("salam, quiz banao").needsInteractive).toBe(true);
  });

  it("drops all formatting scaffolding for small talk", () => {
    const policy = buildResponsePolicyMessage("hey", { skipTutor: true }).content;
    expect(policy).toContain("one short line");
    expect(policy).not.toContain("80 words");
    expect(policy).not.toMatch(/heading only when/);
  });

  it("flags math and asks for LaTeX", () => {
    const signals = detectTaskSignals("Derive the quadratic formula for ax^2 + bx + c = 0");
    expect(signals.needsMath).toBe(true);
    expect(signals.budget).toBe("medium");
    expect(buildResponsePolicyMessage("Solve 2+2").content).toMatch(/\$inline\$/);
    expect(buildResponsePolicyMessage("hi").content).toContain("You are Ken, a tutor");
    expect(buildResponsePolicyMessage("hi", { skipTutor: true }).content).not.toContain("You are Ken, a tutor");
  });

  it("uses structure for how-to questions and quotes for citations", () => {
    expect(detectTaskSignals("How do I set up a MERN stack?").needsStructure).toBe(true);
    expect(detectTaskSignals('He said that "cookies must stay HttpOnly" — is that true?').needsQuotes).toBe(true);
    expect(detectTaskSignals("Quiz do Newton's laws").needsInteractive).toBe(true);
  });

  it("only expands length when the user asked for depth", () => {
    expect(detectTaskSignals("Write a comprehensive guide to JWT cookies").budget).toBe("long");
  });
});
