import { describe, expect, it, vi } from "vitest";
import type { PublicSearchHit } from "@aether/shared";
import { UnconfiguredAnalysisRunner } from "../analysis/UnconfiguredAnalysisRunner.js";
import { UnconfiguredImageProvider } from "../image/UnconfiguredImageProvider.js";
import { UnconfiguredSearchProvider } from "../search/UnconfiguredSearchProvider.js";
import { formatSearchHits, ToolManager } from "./ToolManager.js";

vi.mock("../storage/fileService.js", () => ({
  uploadUserFile: vi.fn(async () => ({
    id: "file1",
    originalName: "aether-image.png",
    mimeType: "image/png",
    size: 8,
    kind: "image",
    status: "ready",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  })),
}));

const hits: PublicSearchHit[] = [
  { title: "Example", url: "https://example.com", snippet: "Hello" },
];

describe("ToolManager", () => {
  it("lists unconfigured tools with honest unavailable reasons", () => {
    const manager = new ToolManager(
      new UnconfiguredSearchProvider(),
      new UnconfiguredImageProvider(),
      new UnconfiguredAnalysisRunner(),
    );
    const tools = manager.listPublic(["text", "streaming", "tools"]);
    expect(tools.every((tool) => tool.configured === false && tool.available === false)).toBe(true);
    expect(tools.find((tool) => tool.id === "web_search")?.unavailableReason).toMatch(/SEARCH_PROVIDER/);
    expect(tools.find((tool) => tool.id === "image_generation")?.unavailableReason).toMatch(/IMAGE_GENERATION/);
    expect(tools.find((tool) => tool.id === "data_analysis")?.unavailableReason).toMatch(/never executed/);
  });

  it("disables web search when the model cannot use tools", () => {
    const search = {
      id: "tavily",
      isConfigured: () => true,
      unavailableReason: () => "ok",
      search: vi.fn(async () => hits),
    };
    const manager = new ToolManager(search, new UnconfiguredImageProvider(), new UnconfiguredAnalysisRunner());
    const tools = manager.listPublic(["text", "streaming"]);
    expect(tools.find((tool) => tool.id === "web_search")).toMatchObject({
      configured: true,
      available: false,
      unavailableReason: "This model cannot use tools.",
    });
  });

  it("returns SEARCH_NOT_CONFIGURED instead of invented hits", async () => {
    const manager = new ToolManager(
      new UnconfiguredSearchProvider(),
      new UnconfiguredImageProvider(),
      new UnconfiguredAnalysisRunner(),
    );
    await expect(manager.execute("web_search", { query: "latest news" }, { userId: "u1" })).rejects.toMatchObject({
      code: "SEARCH_NOT_CONFIGURED",
      statusCode: 503,
    });
  });

  it("returns IMAGE_GENERATION_NOT_CONFIGURED instead of a fake image", async () => {
    const manager = new ToolManager(
      new UnconfiguredSearchProvider(),
      new UnconfiguredImageProvider(),
      new UnconfiguredAnalysisRunner(),
    );
    await expect(
      manager.execute("image_generation", { prompt: "a lighthouse" }, { userId: "u1" }),
    ).rejects.toMatchObject({
      code: "IMAGE_GENERATION_NOT_CONFIGURED",
      statusCode: 503,
    });
  });

  it("returns ANALYSIS_SANDBOX_NOT_CONFIGURED and never executes code in-process", async () => {
    const sentinel = "__AETHER_ANALYSIS_EXECUTED";
    (globalThis as Record<string, unknown>)[sentinel] = false;
    const manager = new ToolManager(
      new UnconfiguredSearchProvider(),
      new UnconfiguredImageProvider(),
      new UnconfiguredAnalysisRunner(),
    );
    await expect(
      manager.execute(
        "data_analysis",
        { code: `${sentinel} = true; throw new Error("executed")` },
        { userId: "u1" },
      ),
    ).rejects.toMatchObject({
      code: "ANALYSIS_SANDBOX_NOT_CONFIGURED",
      statusCode: 503,
    });
    expect((globalThis as Record<string, unknown>)[sentinel]).toBe(false);
  });

  it("rejects chat web search when the model cannot use tools", async () => {
    const search = {
      id: "tavily",
      isConfigured: () => true,
      unavailableReason: () => "ok",
      search: vi.fn(async () => hits),
    };
    const manager = new ToolManager(search, new UnconfiguredImageProvider(), new UnconfiguredAnalysisRunner());
    await expect(
      manager.applyForChat({
        enabledTools: ["web_search"],
        content: "weather",
        userId: "u1",
        capabilities: ["text"],
      }),
    ).rejects.toMatchObject({ code: "MODEL_TOOLS_UNSUPPORTED" });
    expect(search.search).not.toHaveBeenCalled();
  });

  it("injects real search hits as a system message", async () => {
    const search = {
      id: "tavily",
      isConfigured: () => true,
      unavailableReason: () => "ok",
      search: vi.fn(async () => hits),
    };
    const manager = new ToolManager(search, new UnconfiguredImageProvider(), new UnconfiguredAnalysisRunner());
    const outcome = await manager.applyForChat({
      enabledTools: ["web_search"],
      content: "weather",
      userId: "u1",
      capabilities: ["text", "tools"],
    });
    expect(outcome.systemMessages[0]?.role).toBe("system");
    expect(outcome.systemMessages[0]?.content).toContain("https://example.com");
  });

  it("formats empty search results honestly", () => {
    expect(formatSearchHits([])).toMatch(/no results/i);
    expect(formatSearchHits([])).toMatch(/Do not invent/);
  });
});
