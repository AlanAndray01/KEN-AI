import { describe, expect, it } from "vitest";
import {
  buildResponsePolicyMessage,
  buildResponsePolicyMessages,
  detectTaskSignals,
  isLowThinkingTurn,
  replyMaxTokens,
} from "./responsePolicy.js";

describe("detectTaskSignals", () => {
  it("caps decode length to the turn's reply budget", () => {
    expect(replyMaxTokens("minimal")).toBe(256);
    expect(replyMaxTokens("short")).toBe(1024);
    expect(replyMaxTokens("medium")).toBe(4096);
    expect(replyMaxTokens("long")).toBe(16_384);
  });

  it("splits the stable prefix from the per-turn policy so Groq can cache it", () => {
    const messages = buildResponsePolicyMessages("Explain photosynthesis");
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain("You are Ken AI");
    expect(messages[0]?.content).toContain("general-purpose assistant");
    expect(messages[0]?.content).not.toContain("Ken reply policy");
    expect(messages[1]?.content).toContain("Ken reply policy");
    expect(messages[1]?.content).not.toContain("You are Ken AI");
  });

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

  it("treats a short factual question as low-thinking, not a medium essay", () => {
    const signals = detectTaskSignals("So Whose the father of science?");
    expect(signals.budget).toBe("short");
    expect(isLowThinkingTurn(signals)).toBe(true);
    expect(replyMaxTokens(signals.budget)).toBe(1024);
  });

  it("does not treat a greeting that carries a real request as small talk", () => {
    expect(detectTaskSignals("hi, explain Newton's second law").budget).not.toBe("minimal");
    expect(detectTaskSignals("salam, quiz banao").needsInteractive).toBe(true);
  });

  it("drops all formatting scaffolding for small talk", () => {
    const policy = buildResponsePolicyMessage("hey", { skipProtocol: true }).content;
    expect(policy).toContain("one short line");
    expect(policy).not.toContain("80 words");
    expect(policy).not.toMatch(/heading only when/);
  });

  it("flags math and asks for LaTeX that will render", () => {
    const signals = detectTaskSignals("Derive the quadratic formula for ax^2 + bx + c = 0");
    expect(signals.needsMath).toBe(true);
    expect(signals.budget).toBe("medium");
    expect(buildResponsePolicyMessage("Solve 2+2").content).toMatch(/\$inline\$/);
    expect(buildResponsePolicyMessage("Solve 2+2").content).toMatch(/Do not leave TeX commands/);
    expect(buildResponsePolicyMessage("hi").content).toContain("You are Ken AI");
    expect(buildResponsePolicyMessage("hi").content).not.toContain("general-purpose assistant");
    expect(buildResponsePolicyMessage("hi", { skipProtocol: true }).content).not.toContain(
      "general-purpose assistant",
    );
  });

  it("flags coding questions and keeps code fences for source only", () => {
    const signals = detectTaskSignals("Write a Python function that reverses a string");
    expect(signals.needsCode).toBe(true);
    expect(signals.budget).toBe("medium");
    expect(buildResponsePolicyMessage("Write a Python function that reverses a string").content).toMatch(
      /language-tagged fence/i,
    );
  });

  it("sends the Ken AI identity on every turn, custom GPTs included", () => {
    for (const message of [
      buildResponsePolicyMessage("hi"),
      buildResponsePolicyMessage("which model are you?"),
      buildResponsePolicyMessage("who made you?", { skipProtocol: true }),
    ]) {
      expect(message.content).toContain("You are Ken AI");
      expect(message.content).toContain("the selected model");
      expect(message.content).toContain("I am Ken AI powered by the selected model");
      expect(message.content).not.toContain("provided by Groq");
      expect(message.content).toContain("Never identify as ChatGPT");
    }
  });

  it("asks for display fences on their own lines when the turn needs math", () => {
    // A `$$` fence sharing its line with LaTeX never closes in remark-math.
    expect(buildResponsePolicyMessage("Solve 3x^2 - 12x + 9 = 0").content).toContain("alone on its own line");
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

describe("buildResponsePolicyMessages token trimming", () => {
  const fixed = (question: string, modelName = "Gemini 3.5 Flash") =>
    buildResponsePolicyMessages(question, { modelName })[0]!.content;
  const perTurn = (question: string, options: { mathContext?: boolean } = {}) =>
    buildResponsePolicyMessages(question, options)[1]!.content;

  it("leaves the full math layout and quiz templates out of a plain question", () => {
    const all = `${fixed("What causes the seasons?")}\n${perTurn("What causes the seasons?")}`;
    expect(all).not.toContain("Math layout");
    // The template bodies, not the one-line "never emit [QUIZ] unless asked".
    expect(all).not.toContain("Correct: B");
    expect(all).not.toContain("[MINDMAP:Title]");
    // The one-line math rule still rides along, so a stray equation is still LaTeX.
    expect(all).toContain("$inline$ and $$display$$");
  });

  it("sends the full math layout on a math question", () => {
    expect(perTurn("Solve 3x^2 - 12x + 9 = 0")).toContain("Math layout");
    expect(perTurn("Solve 3x^2 - 12x + 9 = 0")).toContain("\\begin{aligned}");
  });

  it("keeps the math layout on a terse follow-up in a math thread", () => {
    expect(perTurn("and the next step?")).not.toContain("Math layout");
    expect(perTurn("and the next step?", { mathContext: true })).toContain("Math layout");
  });

  it("sends the quiz and flashcard formats only when one is asked for", () => {
    expect(perTurn("Make me a quiz on the solar system")).toContain("[QUIZ]");
    expect(perTurn("Make me a quiz on the solar system")).toContain("[FLASHCARDS]");
  });

  it("ends the fixed block with the model line, so switching models keeps the rest reusable", () => {
    const gemini = fixed("What is DNA?", "Gemini 3.5 Flash");
    const llama = fixed("What is DNA?", "Llama 4 Scout");
    expect(gemini.endsWith("I am Ken AI powered by Gemini 3.5 Flash.")).toBe(true);
    const shared = gemini.indexOf("This turn is running on");
    expect(gemini.slice(0, shared)).toBe(llama.slice(0, shared));
  });
});
