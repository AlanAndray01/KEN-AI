import { describe, expect, it, vi } from "vitest";

vi.mock("./instructionService.js", () => ({
  getInstructions: vi.fn(async () => ({
    aboutUser: "Likes TypeScript",
    howToRespond: "Be concise",
    additional: "",
    updatedAt: "2026-01-01T00:00:00.000Z",
  })),
}));

vi.mock("./memoryService.js", () => ({
  listMemories: vi.fn(async () => [{ id: "m1", content: "Uses Vite", source: "manual" }]),
}));

vi.mock("../gpts/gptService.js", () => ({
  getAccessibleGpt: vi.fn(async () => ({
    doc: {
      name: "Writer",
      instructions: "Write like an editor.",
      knowledgeFileIds: [],
      creatorId: "u1",
    },
    public: {
      id: "g1",
      name: "Writer",
      description: "Editing help",
      knowledgeFileIds: [],
    },
  })),
}));

vi.mock("../storage/fileService.js", () => ({
  loadOwnedFiles: vi.fn(async () => []),
  materializeFilesForModel: vi.fn(async () => ({ contentSuffix: "", parts: [] })),
}));

describe("buildPersonaMessages", () => {
  it("injects GPT instructions, custom instructions, and memories", async () => {
    const { buildPersonaMessages } = await import("./persona.js");
    const messages = await buildPersonaMessages("u1", "g1");
    const combined = messages.map((message) => message.content).join("\n");
    expect(messages.every((message) => message.role === "system")).toBe(true);
    expect(combined).toContain("Write like an editor.");
    expect(combined).toContain("Likes TypeScript");
    expect(combined).toContain("Uses Vite");
    expect(combined).toMatch(/do not invent additional memories/i);
  });

  it("loads at most 4 memories for the system prompt", async () => {
    const { listMemories } = await import("./memoryService.js");
    const { buildPersonaMessages } = await import("./persona.js");
    await buildPersonaMessages("u1");
    expect(listMemories).toHaveBeenCalledWith("u1", 4);
  });
});
