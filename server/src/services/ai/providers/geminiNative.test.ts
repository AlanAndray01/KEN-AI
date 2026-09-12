import { describe, expect, it } from "vitest";
import {
  buildNativeGeminiBody,
  extractGeminiCandidateText,
  nativeGeminiUrl,
  requestHasInlineMedia,
} from "./geminiNative.js";

const pdfRequest = {
  providerId: "gemini",
  modelId: "gemini-3.5-flash-lite",
  messages: [
    {
      role: "user" as const,
      content: "Summarise this",
      parts: [{ type: "inline" as const, mimeType: "application/pdf", data: "JVBER", filename: "report.pdf" }],
    },
  ],
};

describe("gemini native multimodal", () => {
  it("detects image and PDF parts but not text-only turns", () => {
    expect(requestHasInlineMedia([{ role: "user", content: "hello" }])).toBe(false);
    expect(
      requestHasInlineMedia([
        { role: "user", content: "look", parts: [{ type: "inline", mimeType: "image/png", data: "AAAA" }] },
      ]),
    ).toBe(true);
    expect(requestHasInlineMedia(pdfRequest.messages)).toBe(true);
  });

  it("builds generateContent contents with inlineData for a PDF", () => {
    const body = buildNativeGeminiBody(pdfRequest);
    expect(body.contents).toEqual([
      {
        role: "user",
        parts: [{ text: "Summarise this" }, { inlineData: { mimeType: "application/pdf", data: "JVBER" } }],
      },
    ]);
    expect(body.systemInstruction).toBeUndefined();
    expect(body.generationConfig).toMatchObject({ maxOutputTokens: expect.any(Number) });
  });

  it("lifts system text into systemInstruction", () => {
    const body = buildNativeGeminiBody({
      ...pdfRequest,
      messages: [{ role: "system", content: "Be brief" }, ...pdfRequest.messages],
    });
    expect(body.systemInstruction).toEqual({ parts: [{ text: "Be brief" }] });
  });

  it("points at native generateContent, not the OpenAI-compat prefix", () => {
    expect(nativeGeminiUrl("gemini-3.5-flash-lite", false)).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    );
    expect(nativeGeminiUrl("gemini-3.5-flash-lite", true)).toContain(":streamGenerateContent?alt=sse");
    expect(nativeGeminiUrl("gemini-3.5-flash-lite", false)).not.toContain("/openai");
  });

  it("skips thought parts when reading a candidate", () => {
    const extracted = extractGeminiCandidateText({
      candidates: [
        {
          content: {
            parts: [
              { thought: true, text: "hidden" },
              { text: "Visible answer" },
            ],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 },
    });
    expect(extracted.text).toBe("Visible answer");
    expect(extracted.finishReason).toBe("STOP");
    expect(extracted.usage).toEqual({ inputTokens: 4, outputTokens: 2, totalTokens: 6 });
  });
});
