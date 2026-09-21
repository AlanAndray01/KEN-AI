import { afterEach, describe, expect, it } from "vitest";
import {
  CLOUDFLARE_IMAGE_MODEL_ID,
  CLOUDFLARE_VISION_MODEL_ID,
  DEFAULT_GEMINI_MODEL_ID,
  DEFAULT_GROQ_MODEL_ID,
  GEMINI_PRO_MODEL_ID,
  GROQ_QUALITY_MODEL_ID,
  type ModelCapability,
} from "@Ken/shared";
import { classifyAutoTask, pickAutoRoute, planAutoRoute, type RoutableModel } from "./autoRoute.js";
import { AppError } from "../../utils/AppError.js";
import { clearModelSkips, rememberModelSkip } from "../ai/modelSkip.js";

function model(providerId: string, id: string, capabilities: ModelCapability[], available = true): RoutableModel {
  return { providerId, id, capabilities, available, enabled: true };
}

const TEXT: ModelCapability[] = ["text", "streaming"];
const GEMINI: ModelCapability[] = ["text", "vision", "files", "streaming", "tools"];
const FILES: ModelCapability[] = ["text", "vision", "files", "streaming", "tools"];

const geminiLite = model("gemini", DEFAULT_GEMINI_MODEL_ID, GEMINI);
const geminiPro = model("gemini", GEMINI_PRO_MODEL_ID, GEMINI);
const groqFast = model("groq", DEFAULT_GROQ_MODEL_ID, TEXT);
const groqQuality = model("groq", GROQ_QUALITY_MODEL_ID, TEXT);
const gpt41 = model("openai", "gpt-4.1", FILES);
const cloudflareScout = model("cloudflare", CLOUDFLARE_VISION_MODEL_ID, ["text", "vision", "streaming"]);
const cloudflareFlux = model("cloudflare", CLOUDFLARE_IMAGE_MODEL_ID, ["imageGeneration"]);
const miniOpenAI = model("openai", "gpt-4o-mini", FILES);
const ollama = model("ollama", "llama3.2", TEXT);

afterEach(() => {
  clearModelSkips();
});

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
    expect(classifyAutoTask({ content: "draw a cat" })).toBe("image");
    // An attached photo is still vision, even if the text also asks to draw.
    expect(classifyAutoTask({ content: "draw a cat", files: [{ mimeType: "image/png" }] })).toBe("vision");
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
    // Groq leads quick and chat: both need only "text", and it has a key pool
    // where Gemini has one shared free-tier bucket. Gemini is the next hop, so
    // the tier still degrades sensibly rather than jumping to a heavyweight.
    expect(pickAutoRoute([gpt41, geminiPro, geminiLite, groqFast], "quick")).toMatchObject({
      modelId: DEFAULT_GROQ_MODEL_ID,
    });
    expect(pickAutoRoute([gpt41, geminiPro, geminiLite], "quick")).toMatchObject({
      modelId: DEFAULT_GEMINI_MODEL_ID,
    });
    expect(pickAutoRoute([gpt41, groqFast], "quick")).toMatchObject({ modelId: DEFAULT_GROQ_MODEL_ID });
  });

  it("uses Cloudflare 3B, not 70B, when Auto has only Workers AI left", () => {
    const cf70 = model("cloudflare", "@cf/meta/llama-3.3-70b-instruct-fp8-fast", TEXT);
    const cf3b = model("cloudflare", "@cf/meta/llama-3.2-3b-instruct", TEXT);
    expect(pickAutoRoute([cf70, cf3b], "quick")).toMatchObject({
      modelId: "@cf/meta/llama-3.2-3b-instruct",
      preferred: true,
    });
  });

  it("keeps vision on Gemini even though Groq now leads the text tiers", () => {
    expect(pickAutoRoute([groqFast, geminiLite], "vision")).toMatchObject({ providerId: "gemini" });
  });

  it("never chooses an unavailable model", () => {
    const offline = model("openai", "gpt-4.1", FILES, false);
    expect(pickAutoRoute([offline, groqQuality], "code")).toMatchObject({ modelId: GROQ_QUALITY_MODEL_ID });
  });

  it("requires the capability the attachment needs", () => {
    expect(pickAutoRoute([groqFast, geminiLite], "vision")).toMatchObject({ providerId: "gemini" });
    expect(pickAutoRoute([geminiLite, miniOpenAI], "files")).toMatchObject({ providerId: "openai" });
    expect(pickAutoRoute([geminiLite, groqFast], "files")).toMatchObject({ providerId: "gemini" });
    expect(pickAutoRoute([groqFast], "files")).toBeUndefined();
  });

  it("skips Gemini for Auto vision after a vendor 401 cooldown", () => {
    rememberModelSkip(
      "gemini",
      DEFAULT_GEMINI_MODEL_ID,
      new AppError("That model could not authenticate the request.", {
        statusCode: 502,
        code: "PROVIDER_INVALID_CREDENTIALS",
        extra: { httpStatus: 401 },
      }),
    );
    expect(pickAutoRoute([groqFast, geminiLite, cloudflareScout], "vision")).toMatchObject({
      providerId: "cloudflare",
      modelId: CLOUDFLARE_VISION_MODEL_ID,
    });
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

  it("routes a picture request to Flux, not a caption model", () => {
    expect(classifyAutoTask({ content: "generate an image of a sunset" })).toBe("image");
    expect(pickAutoRoute([groqFast, geminiLite, cloudflareFlux], "image")).toMatchObject({
      providerId: "cloudflare",
      modelId: CLOUDFLARE_IMAGE_MODEL_ID,
      preferred: true,
    });
  });

  it("does not degrade an image turn when Flux is missing", () => {
    const plan = planAutoRoute([groqFast, geminiLite], { content: "generate an image of a sunset" });
    expect(plan).toEqual({ task: "image", route: undefined });
  });

  it("degrades a PDF turn to chat when no file-capable model exists, so text extraction can run", () => {
    const plan = planAutoRoute([groqFast], { content: "summarise", files: [{ mimeType: "application/pdf" }] });
    expect(plan.task).toBe("chat");
    expect(plan.route).toMatchObject({ providerId: "groq" });
  });
});

describe("long-context routing", () => {
  const words = "the quick brown fox jumps over the lazy dog analysis report section".split(" ");
  /** Comfortably past the 8,000-token threshold at the ~4-chars/token estimate. */
  const document = Array.from({ length: 8_000 }, (_, i) => words[i % words.length]).join(" ");
  const midSized = Array.from({ length: 1_200 }, (_, i) => words[i % words.length]).join(" ");

  it("sends a pasted document to the size tier rather than ordinary chat", () => {
    expect(classifyAutoTask({ content: `Summarise this document:\n\n${document}` })).toBe("longContext");
  });

  it("leaves input below the threshold on the ordinary tiers", () => {
    // ~1,800 tokens: Groq holds this within its 6,000-token input budget, so
    // there is nothing to route away from.
    expect(classifyAutoTask({ content: `Summarise this:\n\n${midSized}` })).not.toBe("longContext");
  });

  it("leaves ordinary turns alone", () => {
    expect(classifyAutoTask({ content: "hi" })).toBe("quick");
    expect(classifyAutoTask({ content: "What does this function do? It adds two numbers together." })).not.toBe(
      "longContext",
    );
  });

  it("still prefers the code tier for a long code request", () => {
    // Size is checked after difficulty, so a big code paste is still code.
    expect(
      classifyAutoTask({
        content: `Write a complete production-ready React data table component.\n\n${document}`,
      }),
    ).toBe("code");
  });

  it("picks Gemini's million-token window over Groq for the size tier", () => {
    expect(pickAutoRoute([groqFast, geminiLite], "longContext")).toMatchObject({
      providerId: "gemini",
      modelId: DEFAULT_GEMINI_MODEL_ID,
    });
    // The same two models still route an ordinary chat turn to Groq.
    expect(pickAutoRoute([groqFast, geminiLite], "chat")).toMatchObject({ providerId: "groq" });
  });

  it("prefers Cloudflare's 131k Scout over Groq once Gemini is out", () => {
    // Groq is deliberately not listed for this tier: its 6,000-token input
    // budget is below the threshold that routes here, so it would truncate the
    // very document the tier exists to hold.
    expect(pickAutoRoute([groqFast, cloudflareScout], "longContext")).toMatchObject({
      providerId: "cloudflare",
      modelId: CLOUDFLARE_VISION_MODEL_ID,
      preferred: true,
    });
  });

  it("still answers on Groq rather than failing when it is the only model left", () => {
    // Unpreferred, not unavailable — a trimmed answer beats no answer once
    // every model that could hold the document is gone.
    expect(pickAutoRoute([groqFast], "longContext")).toMatchObject({ providerId: "groq", preferred: false });
  });
});
