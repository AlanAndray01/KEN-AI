import { describe, expect, it } from "vitest";
import { sanitizeTitle, titleFromContent } from "./chatTitle.js";

describe("titleFromContent", () => {
  it("summarizes a long first prompt into at most five words", () => {
    expect(titleFromContent("Hey so What is this right space on the screen is for i dont know why?")).toBe(
      "What Right Space Screen Dont",
    );
    expect(titleFromContent("Help me set up a MERN stack")).toBe("Help Set Up MERN Stack");
    expect(titleFromContent("  hi  ")).toBe("Hi");
    expect(titleFromContent("")).toBe("New chat");
  });
});

describe("sanitizeTitle", () => {
  it("keeps a title the model got right", () => {
    expect(sanitizeTitle("Quadratic Equation Roots")).toBe("Quadratic Equation Roots");
  });

  it("strips the wrappers small models add anyway", () => {
    expect(sanitizeTitle('"Photosynthesis Basics"')).toBe("Photosynthesis Basics");
    expect(sanitizeTitle("Title: Newton's Second Law")).toBe("Newton's Second Law");
    expect(sanitizeTitle("**Ohm's Law Explained**")).toBe("Ohm's Law Explained");
    expect(sanitizeTitle("Chat title - Cell Division")).toBe("Cell Division");
    expect(sanitizeTitle("Mole Conversion Steps.")).toBe("Mole Conversion Steps");
  });

  it("drops a reasoning block before reading the title", () => {
    expect(sanitizeTitle("<think>the user wants algebra</think>\nAlgebra Practice Set")).toBe(
      "Algebra Practice Set",
    );
  });

  it("takes only the first line when the model keeps talking", () => {
    expect(sanitizeTitle("Trigonometry Identities\n\nLet me know if you want more.")).toBe(
      "Trigonometry Identities",
    );
  });

  it("cuts a sentence-length answer down to a sidebar-sized title", () => {
    const long = sanitizeTitle(
      "A Detailed Discussion About How Photosynthesis Converts Light Into Chemical Energy",
    );
    // Eight words first, then the 60-char cap trims back to a whole word.
    expect(long).toBe("A Detailed Discussion About How Photosynthesis Converts");
    expect(long!.length).toBeLessThanOrEqual(60);
  });

  it("returns null on anything unusable so the placeholder survives", () => {
    expect(sanitizeTitle("")).toBeNull();
    expect(sanitizeTitle("   ")).toBeNull();
    expect(sanitizeTitle('""')).toBeNull();
    expect(sanitizeTitle("<think>only reasoning, no answer</think>")).toBeNull();
  });

  it("does not mangle a non-English title", () => {
    expect(sanitizeTitle("کیمیائی تعامل کی اقسام")).toBe("کیمیائی تعامل کی اقسام");
  });
});
