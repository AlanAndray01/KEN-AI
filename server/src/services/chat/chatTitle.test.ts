import { describe, expect, it } from "vitest";
import { titleFromContent } from "./chatTitle.js";

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
