import { describe, expect, it } from "vitest";
import {
  formatDocumentSections,
  isRelevantFollowUp,
  queryTerms,
  selectSections,
  splitIntoSections,
} from "./documentSections.js";

/** A 20-section policy document where each section is about one topic. */
const TOPICS = [
  "introduction and purpose of this handbook",
  "refund policy: refunds are issued within 14 days of a returned item",
  "shipping times for domestic and international orders",
  "warranty coverage for hardware defects",
  "privacy and how customer data is stored",
  ...Array.from({ length: 15 }, (_, index) => `filler topic number ${index} about office furniture`),
];
const sections = TOPICS.map((topic) => `${topic}. ${"More detail on this subject. ".repeat(50)}`);

describe("splitIntoSections", () => {
  it("groups paragraphs into sections without losing text", () => {
    const text = Array.from({ length: 30 }, (_, index) => `Paragraph ${index}. ${"word ".repeat(80).trim()}`).join("\n\n");
    const result = splitIntoSections(text);
    expect(result.length).toBeGreaterThan(1);
    expect(result.join("\n\n")).toBe(text);
  });

  it("cuts a single enormous paragraph at sentence ends", () => {
    const text = "This is one sentence of a very long paragraph. ".repeat(300);
    const result = splitIntoSections(text);
    expect(result.length).toBeGreaterThan(3);
    expect(result.every((section) => section.length <= 3_000)).toBe(true);
    expect(result.every((section) => section.endsWith("."))).toBe(true);
  });

  it("returns nothing for a document with no text", () => {
    expect(splitIntoSections("   \n\n  ")).toEqual([]);
  });
});

describe("selectSections", () => {
  it("sends a document whole when it fits, so short files are never cut", () => {
    const selection = selectSections(["a", "b", "c"], "anything", 1_000);
    expect(selection).toEqual({ indexes: [0, 1, 2], complete: true });
  });

  it("picks the sections that answer the question when the document does not fit", () => {
    const selection = selectSections(sections, "How long do refunds take?", 3_500);
    expect(selection.complete).toBe(false);
    expect(selection.indexes).toContain(1);
    expect(selection.indexes).not.toContain(3);
  });

  it("matches word forms, so 'refunded' still finds the refund section", () => {
    expect(selectSections(sections, "when is my money refunded", 2_000).indexes).toContain(1);
  });

  it("spreads a summary request across the whole document instead of one corner", () => {
    const selection = selectSections(sections, "Summarise this document", 8_000);
    expect(selection.indexes[0]).toBe(0);
    expect(selection.indexes.at(-1)).toBe(sections.length - 1);
    expect(selection.indexes.some((index) => index > 5 && index < 15)).toBe(true);
  });

  it("stays within the budget", () => {
    const selection = selectSections(sections, "warranty shipping privacy refund", 5_000);
    const used = selection.indexes.reduce((sum, index) => sum + sections[index]!.length, 0);
    expect(used).toBeLessThanOrEqual(5_000);
  });
});

describe("isRelevantFollowUp", () => {
  it("sends the document for a question about its contents", () => {
    expect(isRelevantFollowUp(sections, "what is the warranty coverage for defects")).toBe(true);
  });

  it("sends it when the user points at the file, even vaguely", () => {
    expect(isRelevantFollowUp(sections, "what does the pdf say?")).toBe(true);
  });

  it("leaves it out of an unrelated turn", () => {
    expect(isRelevantFollowUp(sections, "now write me a poem about the ocean")).toBe(false);
  });
});

describe("formatDocumentSections", () => {
  it("labels a partial document so the model knows parts are missing", () => {
    const text = formatDocumentSections("policy.pdf", sections, { indexes: [1, 4], complete: false }, { earlier: true });
    expect(text).toMatch(/^Earlier attachment: policy\.pdf \(sections 2, 5 of 20;/);
    expect(text).toContain("[Section 2]\nrefund policy");
    expect(text).toContain("rather than guessing");
  });

  it("keeps the original note format for a whole document", () => {
    expect(formatDocumentSections("a.txt", ["one", "two"], { indexes: [0, 1], complete: true })).toBe(
      "Attached file: a.txt\none\n\ntwo",
    );
  });
});

describe("queryTerms", () => {
  it("drops filler words and keeps non-Latin scripts", () => {
    expect(queryTerms("What does the file say about پالیسی refunds?")).toEqual(["پالیسی", "refund"]);
  });
});
