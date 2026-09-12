import { describe, expect, it } from "vitest";
import { normalizeAIResponse, toAnthropicMessages, toOpenAIMessages, toProviderContents } from "./normalize.js";

describe("AI response normalizers", () => {
  it("maps vendor finish reasons onto AIResponse", () => {
    expect(normalizeAIResponse({ content: "hi", model: "m", provider: "p", finishReason: "STOP" }).finishReason).toBe(
      "stop",
    );
    expect(
      normalizeAIResponse({ content: "hi", model: "m", provider: "p", finishReason: "max_tokens" }).finishReason,
    ).toBe("length");
  });

  it("splits system messages out of Gemini contents", () => {
    const result = toProviderContents([
      { role: "system", content: "Be brief" },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
      { role: "user", content: "Again" },
    ]);

    expect(result.system).toBe("Be brief");
    expect(result.contents).toEqual([
      { role: "user", parts: [{ text: "Hello" }] },
      { role: "model", parts: [{ text: "Hi" }] },
      { role: "user", parts: [{ text: "Again" }] },
    ]);
  });

  it("drops a trailing model turn so Gemini will accept the request", () => {
    const result = toProviderContents([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ]);
    expect(result.contents).toEqual([{ role: "user", parts: [{ text: "Hello" }] }]);
    expect(toOpenAIMessages([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ])).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("includes inline image parts for Gemini", () => {
    const result = toProviderContents([
      {
        role: "user",
        content: "What is this?",
        parts: [{ type: "inline", mimeType: "image/png", data: "AAAA" }],
      },
    ]);
    expect(result.contents[0]?.parts).toEqual([
      { text: "What is this?" },
      { inlineData: { mimeType: "image/png", data: "AAAA" } },
    ]);
  });

  it("includes PDF parts as native Gemini inlineData", () => {
    const result = toProviderContents([
      {
        role: "user",
        content: "Summarise this",
        parts: [{ type: "inline", mimeType: "application/pdf", data: "JVBER", filename: "report.pdf" }],
      },
    ]);
    expect(result.contents[0]?.parts).toEqual([
      { text: "Summarise this" },
      { inlineData: { mimeType: "application/pdf", data: "JVBER" } },
    ]);
  });
});

describe("PDF attachment passthrough", () => {
  const pdfTurn = [
    {
      role: "user" as const,
      content: "Summarise this",
      parts: [
        { type: "inline" as const, mimeType: "application/pdf", data: "JVBER", filename: "report.pdf" },
      ],
    },
  ];

  it("drops PDFs for compatible surfaces that reject file blocks", () => {
    // Groq, Cerebras, DeepSeek, Cloudflare and Gemini's compat endpoint 400 on
    // an unknown content block, so the part must not be sent to them.
    const [message] = toOpenAIMessages(pdfTurn);
    expect(message?.content).toBe("Summarise this");
  });

  it("sends a PDF as a file block when the adapter opts in", () => {
    const [message] = toOpenAIMessages(pdfTurn, { documents: true });
    expect(message?.content).toEqual([
      { type: "text", text: "Summarise this" },
      {
        type: "file",
        file: { filename: "report.pdf", file_data: "data:application/pdf;base64,JVBER" },
      },
    ]);
  });

  it("sends a PDF to Anthropic as a document block", () => {
    const { messages } = toAnthropicMessages(pdfTurn);
    expect(messages[0]?.content).toEqual([
      { type: "text", text: "Summarise this" },
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBER" } },
    ]);
  });

  it("still carries images alongside a document", () => {
    const mixed = [
      {
        role: "user" as const,
        content: "Compare these",
        parts: [
          { type: "inline" as const, mimeType: "image/png", data: "IMG" },
          { type: "inline" as const, mimeType: "application/pdf", data: "PDF", filename: "a.pdf" },
        ],
      },
    ];
    const [message] = toOpenAIMessages(mixed, { documents: true });
    expect(Array.isArray(message?.content)).toBe(true);
    expect(message?.content).toHaveLength(3);
  });
});
