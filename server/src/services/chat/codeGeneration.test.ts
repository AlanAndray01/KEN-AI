import { describe, expect, it } from "vitest";
import { detectDeepCodeRequest } from "./codeGeneration.js";

describe("detectDeepCodeRequest", () => {
  it("fires on a build request naming a technology", () => {
    expect(detectDeepCodeRequest("Write a TypeScript hook that debounces a value")).toBe(true);
    expect(detectDeepCodeRequest("Implement an Express endpoint for password reset")).toBe(true);
  });

  it("fires on an explicit scope word", () => {
    expect(detectDeepCodeRequest("Build a complete REST api from scratch")).toBe(true);
    expect(detectDeepCodeRequest("I need a production-ready auth service")).toBe(true);
  });

  it("fires on a build request with no language named", () => {
    expect(detectDeepCodeRequest("Implement a caching middleware that buckets per user")).toBe(true);
  });

  it("stays conservative when no artifact noun or language appears", () => {
    // "rate limiter" is not in the artifact lexicon, so this misses. A false
    // positive is worse than a miss here: it would claim the long token budget
    // and show a code ticker over a prose answer.
    expect(detectDeepCodeRequest("Implement a rate limiter that resets hourly")).toBe(false);
  });

  it("fires on substantial debugging", () => {
    expect(
      detectDeepCodeRequest("Here is a python stack trace from my failing test, can you work out the cause"),
    ).toBe(true);
  });

  it("does not fire on a passing mention of code", () => {
    // detectTaskSignals().needsCode is true for these; deep mode must be stricter
    // or every conceptual question would claim the long output budget.
    expect(detectDeepCodeRequest("What does this python error mean?")).toBe(false);
    expect(detectDeepCodeRequest("Is typescript better than javascript?")).toBe(false);
    expect(detectDeepCodeRequest("Explain what an algorithm is")).toBe(false);
  });

  it("does not fire on small talk or very short turns", () => {
    expect(detectDeepCodeRequest("hi")).toBe(false);
    expect(detectDeepCodeRequest("thanks!")).toBe(false);
    expect(detectDeepCodeRequest("")).toBe(false);
  });

  it("does not fire on a non-code request that uses a build verb", () => {
    expect(detectDeepCodeRequest("Write a poem about the sea")).toBe(false);
    expect(detectDeepCodeRequest("Create a study plan for my chemistry exam")).toBe(false);
  });
});
