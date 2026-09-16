import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEMINI_MODEL_ID,
  DEFAULT_GROQ_MODEL_ID,
  GEMINI_PRO_MODEL_ID,
  GROQ_QUALITY_MODEL_ID,
  type ModelCapability,
} from "@Ken/shared";
import { classifyAutoTask, pickAutoRoute, planAutoRoute, type RoutableModel } from "./autoRoute.js";

function model(providerId: string, id: string, capabilities: ModelCapability[], available = true): RoutableModel {
  return { providerId, id, capabilities, available, enabled: true };
}

const TEXT: ModelCapability[] = ["text", "streaming"];
const GEMINI: ModelCapability[] = ["text", "vision", "streaming", "tools"];
const FILES: ModelCapability[] = ["text", "vision", "files", "streaming", "tools"];

const geminiLite = model("gemini", DEFAULT_GEMINI_MODEL_ID, GEMINI);
const geminiPro = model("gemini", GEMINI_PRO_MODEL_ID, GEMINI);
const groqFast = model("groq", DEFAULT_GROQ_MODEL_ID, TEXT);
const groqQuality = model("groq", GROQ_QUALITY_MODEL_ID, TEXT);
const gpt41 = model("openai", "gpt-4.1", FILES);
const miniOpenAI = model("openai", "gpt-4o-mini", FILES);
const ollama = model("ollama", "llama3.2", TEXT);

describe("classifyAutoTask", () => {
  it("sends small talk and short facts to the quick tier", () => {
    expect(classifyAutoTask({ content: "hi" })).toBe("quick");
    expect(classifyAutoTask({ content: "What is the capital of Japan?" })).toBe("quick");
  });

  it("recognises a substantial code request", () => {
    expect(
      classifyAutoTask({ content: "Write a TypeScript Express middleware that rate limits requests per user" }),
    ).toBe("code");
  });

  it("treats proofs and long-form asks as reasoning", () => {
    expect(classifyAutoTask({ content: "Prove that the square root of 2 is irrational" })).toBe("reasoning");
    expect(classifyAutoTask({ content: "Give me a comprehensive, in-depth history of the printing press" })).toBe(
      "reasoning",
    );
  });

  it("keeps an ordinary explanation on the chat tier", () => {
    expect(
      classifyAutoTask({
        content: "Can you explain how the water cycle works and why clouds form at different heights in the sky",
      }),
    ).toBe("chat");
  });

  it("lets attachments and tools decide before content does", () => {
    const code = "Write a TypeScript Express middleware that rate limits requests per user";
    expect(classifyAutoTask({ content: code, files: [{ mimeType: "application/pdf" }] })).toBe("files");
    expect(classifyAutoTask({ content: code, files: [{ mimeType: "image/png" }] })).toBe("vision");
    expect(classifyAutoTask({ content: "latest news", enabledTools: ["web_search"] })).toBe("tools");
  });
});

describe("pickAutoRoute", () => {
  it("routes code to the high tier when it is available", () => {
    const route = pickAutoRoute([geminiLite, groqFast, gpt41, geminiPro], "code");
    expect(route).toMatchObject({ providerId: "openai", modelId: "gpt-4.1", preferred: true });
    expect(route?.reason).toBe("AUTO_ROUTE|code");
  });

  it("walks down the tier when the preferred model has no key", () => {
    const route = pickAutoRoute([geminiLite, groqFast, groqQuality, geminiPro], "code");
    expect(route).toMatchObject({ providerId: "gemini", modelId: GEMINI_PRO_MODEL_ID });
  });

  it("routes quick turns to a fast model, not a heavyweight one", () => {
    expect(pickAutoRoute([gpt41, geminiPro, geminiLite, groqFast], "quick")).toMatchObject({
      modelId: DEFAULT_GEMINI_MODEL_ID,
    });
    expect(pickAutoRoute([gpt41, groqFast], "quick")).toMatchObject({ modelId: DEFAULT_GROQ_MODEL_ID });
  });

  it("never chooses an unavailable model", () => {
    const offline = model("openai", "gpt-4.1", FILES, false);
    expect(pickAutoRoute([offline, groqQuality], "code")).toMatchObject({ modelId: GROQ_QUALITY_MODEL_ID });
  });

  it("requires the capability the attachment needs", () => {
    expect(pickAutoRoute([groqFast, geminiLite], "vision")).toMatchObject({ providerId: "gemini" });
    // Gemini declares vision but not files, so a PDF must go to a file-capable model.
    expect(pickAutoRoute([geminiLite, miniOpenAI], "files")).toMatchObject({ providerId: "openai" });
    expect(pickAutoRoute([geminiLite, groqFast], "files")).toBeUndefined();
  });

  it("uses a local daemon only when nothing hosted can serve the turn", () => {
    const unlisted = model("cerebras", "some-other-model", TEXT);
    expect(pickAutoRoute([ollama, unlisted], "chat")).toMatchObject({ providerId: "cerebras", preferred: false });
    expect(pickAutoRoute([ollama], "chat")).toMatchObject({ providerId: "ollama", preferred: false });
  });
});

describe("planAutoRoute", () => {
  it("degrades a tools turn to chat when no model can use tools", () => {
    const plan = planAutoRoute([groqFast], { content: "latest news", enabledTools: ["web_search"] });
    expect(plan.task).toBe("chat");
    expect(plan.route).toMatchObject({ providerId: "groq" });
  });

  it("does not degrade an attachment turn that no model can read", () => {
    const plan = planAutoRoute([groqFast], { content: "summarise", files: [{ mimeType: "application/pdf" }] });
    expect(plan).toEqual({ task: "files", route: undefined });
  });
});
