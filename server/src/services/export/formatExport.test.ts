import { describe, expect, it } from "vitest";
import { formatExport, safeExportFilename } from "./formatExport.js";

const sample = [
  {
    id: "c1",
    title: "Hello world",
    createdAt: "2026-01-01T00:00:00.000Z",
    messages: [
      { role: "user", content: "Hi", createdAt: "2026-01-01T00:00:00.000Z" },
      { role: "assistant", content: "Hello", createdAt: "2026-01-01T00:00:01.000Z" },
    ],
  },
];

describe("formatExport", () => {
  it("serializes JSON without inventing messages", () => {
    const body = formatExport(sample, "json");
    const parsed = JSON.parse(body) as {
      conversations: Array<{ title: string; messages: Array<{ content: string }> }>;
    };
    expect(parsed.conversations).toHaveLength(1);
    expect(parsed.conversations[0]?.title).toBe("Hello world");
    expect(parsed.conversations[0]?.messages.map((item) => item.content)).toEqual(["Hi", "Hello"]);
  });

  it("renders markdown and plain text from the same messages", () => {
    const md = formatExport(sample, "md");
    const txt = formatExport(sample, "txt");
    expect(md).toContain("# Hello world");
    expect(md).toContain("**User**");
    expect(md).toContain("Hi");
    expect(txt).toContain("Hello world");
    expect(txt).toContain("User");
    expect(txt).toContain("Hello");
  });

  it("sanitizes download filenames", () => {
    expect(safeExportFilename("My chat: draft?")).toBe("My-chat-draft");
    expect(safeExportFilename("   ")).toBe("conversation");
  });
});
