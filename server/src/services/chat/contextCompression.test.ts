import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../ai/AIProvider.js";
import { compactCodeHistory, findCodeBlocks } from "./contextCompression.js";

function code(lines: number, first = "const value = 1;"): string {
  return [first, ...Array.from({ length: lines - 1 }, (_, index) => `line(${index});`)].join("\n");
}

/** Four short turns that fill the verbatim tail, so earlier messages count as old. */
const recentTail: ChatMessage[] = [
  { role: "user", content: "next" },
  { role: "assistant", content: "ok" },
  { role: "user", content: "and then?" },
  { role: "assistant", content: "done" },
];

describe("compactCodeHistory", () => {
  it("shrinks a long block in an old message to a one-line stub", () => {
    const body = ["export function login() {}", "export class Session {}", code(20)].join("\n");
    const [old] = compactCodeHistory([
      { role: "assistant", content: `Here you go:\n\n\`\`\`ts\n${body}\n\`\`\`\n\nThat is all.` },
      ...recentTail,
    ]);

    expect(old?.content).not.toContain("line(5)");
    expect(old?.content).toMatch(/\[Earlier ts block, 22 lines, defines login, Session\./);
    // The prose around the code survives.
    expect(old?.content).toContain("Here you go:");
    expect(old?.content).toContain("That is all.");
  });

  it("leaves short snippets alone", () => {
    const snippet = "```js\nconsole.log(1);\n```";
    const [old] = compactCodeHistory([{ role: "assistant", content: snippet }, ...recentTail]);
    expect(old?.content).toBe(snippet);
  });

  it("never touches the most recent messages", () => {
    const fresh = `\`\`\`ts\n${code(30)}\n\`\`\``;
    const result = compactCodeHistory([{ role: "user", content: "hi" }, { role: "assistant", content: fresh }]);
    expect(result[1]?.content).toBe(fresh);
  });

  it("never touches system messages", () => {
    const system: ChatMessage = { role: "system", content: `\`\`\`ts\n${code(30)}\n\`\`\`` };
    const [result] = compactCodeHistory([system, ...recentTail]);
    expect(result).toBe(system);
  });

  it("keeps the newest version of a file whole and shrinks the older ones", () => {
    const v1 = `Here is \`src/auth.ts\`:\n\n\`\`\`ts\n${code(12, "// v1")}\n\`\`\``;
    const v2 = `Updated **auth.ts**:\n\n\`\`\`ts\n${code(12, "// v2")}\n\`\`\``;
    const other = `\`\`\`py\n# utils.py\n${code(12)}\n\`\`\``;
    const result = compactCodeHistory([
      { role: "assistant", content: v1 },
      { role: "assistant", content: v2 },
      { role: "assistant", content: other },
      ...recentTail,
    ]);

    expect(result[0]?.content).toContain('[Earlier ts "src/auth.ts" block');
    expect(result[1]?.content).toContain("// v2");
    // Newest (and only) version of utils.py, found from its leading comment.
    expect(result[2]?.content).toContain("# utils.py");
  });

  it("drops an old copy when the file was rewritten in the recent tail", () => {
    const old = `\`\`\`ts title="api.ts"\n${code(12)}\n\`\`\``;
    const result = compactCodeHistory([
      { role: "assistant", content: old },
      { role: "user", content: "fix it" },
      { role: "assistant", content: `\`\`\`ts api.ts\n${code(12)}\n\`\`\`` },
      { role: "user", content: "thanks" },
      { role: "assistant", content: "welcome" },
    ]);
    expect(result[0]?.content).toContain('[Earlier ts "api.ts" block');
  });

  it("shrinks an unclosed block from a reply that was cut off", () => {
    const [old] = compactCodeHistory([
      { role: "assistant", content: `Start:\n\`\`\`go\nfunc main() {}\n${code(12)}` },
      ...recentTail,
    ]);
    expect(old?.content).toBe("Start:\n[Earlier go block, 13 lines, defines main. Omitted here to save space; the user still sees it in full. If its exact lines matter, ask the user to paste it rather than guessing.]");
  });

  it("shrinks every long block, even a file's newest version, when asked to", () => {
    const [old] = compactCodeHistory(
      [{ role: "assistant", content: `\`\`\`ts title="only.ts"\n${code(12)}\n\`\`\`` }],
      { verbatimTail: 0, stubAll: true },
    );
    expect(old?.content).toContain('[Earlier ts "only.ts" block');
  });

  it("is stable when applied twice", () => {
    const history: ChatMessage[] = [{ role: "assistant", content: `\`\`\`ts\n${code(20)}\n\`\`\`` }, ...recentTail];
    const once = compactCodeHistory(history);
    expect(compactCodeHistory(once)).toEqual(once);
  });

  it("keeps the original message objects untouched", () => {
    const original: ChatMessage = { role: "assistant", content: `\`\`\`ts\n${code(20)}\n\`\`\`` };
    const before = original.content;
    compactCodeHistory([original, ...recentTail]);
    expect(original.content).toBe(before);
  });
});

describe("findCodeBlocks", () => {
  it("pairs fences by character and length", () => {
    const blocks = findCodeBlocks("````md\n```ts\ninner\n```\n````\nafter");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.body).toEqual(["```ts", "inner", "```"]);
  });
});
