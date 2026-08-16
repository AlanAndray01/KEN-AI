import { describe, expect, it } from "vitest";
import { applyMention, filterMentions, mentionTokenAt } from "./mentions";

describe("mentions", () => {
  it("detects an @query at the cursor", () => {
    expect(mentionTokenAt("hello @wri", 11)).toEqual({ start: 6, query: "wri" });
    expect(mentionTokenAt("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionTokenAt("email me@host.com", 17)).toBeUndefined();
  });

  it("inserts a GPT mention and filters candidates", () => {
    expect(applyMention("hello @wri", 6, 11, "Writer")).toBe("hello @Writer ");
    expect(
      filterMentions(
        [
          { id: "1", name: "Writer" },
          { id: "2", name: "Coder" },
        ],
        "wri",
      ),
    ).toEqual([{ id: "1", name: "Writer" }]);
  });
});
