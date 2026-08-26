import { describe, expect, it } from "vitest";
import { buildResponsePolicyMessage } from "./responsePolicy.js";
import { LANGUAGE_RULE } from "./languageRule.js";

describe("LANGUAGE_RULE", () => {
  it("names every language tier the product promises", () => {
    expect(LANGUAGE_RULE).toMatch(/same script/i);
    expect(LANGUAGE_RULE).toContain("اردو");
    expect(LANGUAGE_RULE).toMatch(/roman urdu/i);
    expect(LANGUAGE_RULE).toMatch(/any other language/i);
  });

  it("forbids drifting back to another language mid-conversation", () => {
    expect(LANGUAGE_RULE).toMatch(/never drift back/i);
    expect(LANGUAGE_RULE).toMatch(/switch only when the user switches/i);
  });

  it("keeps technical vocabulary in English so syllabus terms survive", () => {
    expect(LANGUAGE_RULE).toMatch(/technical terms.*stay in English/is);
    expect(LANGUAGE_RULE).toMatch(/do not translate them/i);
  });
});

describe("buildResponsePolicyMessage language coverage", () => {
  it("sends the language rule on an ordinary tutor turn", () => {
    expect(buildResponsePolicyMessage("Explain photosynthesis").content).toContain(LANGUAGE_RULE);
  });

  it("still sends it when a custom GPT skips the tutor protocol", () => {
    // The gap this guards: `skipTutor` drops TUTOR_PROTOCOL, so a language rule
    // living inside that block would silently vanish for every custom GPT and a
    // user writing Urdu would be answered in English.
    const message = buildResponsePolicyMessage("Explain photosynthesis", { skipTutor: true });
    expect(message.content).toContain(LANGUAGE_RULE);
    expect(message.content).not.toContain("You are Ken, a tutor");
  });

  it("sends it for small talk, where the reply is a single line", () => {
    expect(buildResponsePolicyMessage("salam").content).toContain(LANGUAGE_RULE);
  });

  it("orders identity before language before the reply policy", () => {
    const { content } = buildResponsePolicyMessage("hello");
    const identityAt = content.indexOf("You are Ken AI");
    const languageAt = content.indexOf("Language matching.");
    const policyAt = content.indexOf("Ken reply policy");

    expect(identityAt).toBeGreaterThanOrEqual(0);
    expect(languageAt).toBeGreaterThan(identityAt);
    expect(policyAt).toBeGreaterThan(languageAt);
  });
});
