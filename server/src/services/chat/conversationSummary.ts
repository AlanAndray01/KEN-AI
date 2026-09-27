import mongoose from "mongoose";
import { stripReasoning } from "@Ken/shared";
import { logger } from "../../config/logger.js";
import { Conversation } from "../../models/Conversation.js";
import { Message } from "../../models/Message.js";
import { toSafeError } from "../../utils/redact.js";
import { telemetry } from "../../utils/telemetry.js";
import type { ChatMessage } from "../ai/AIProvider.js";
import { aiProviderManager } from "../ai/AIProviderManager.js";
import { hasEnvApiKey } from "../ai/credentials.js";
import { resolveTitleRoute } from "./chatTitle.js";
import { compactCodeHistory } from "./contextCompression.js";

/*
 * Rolling summary of older turns.
 *
 * Every model call resends the conversation, so without this a long thread
 * either pays for its whole recent history on every send or silently loses
 * whatever falls out of the window. Instead, turns older than the recent window
 * are folded into a short running summary that is sent in their place.
 *
 * The summary is only ever the model's copy. Message rows are never touched, so
 * the chat the user scrolls through is exactly what was written.
 */

/** Newest turns always sent word for word, after the summary. */
export const SUMMARY_KEEP_RECENT = 6;

/**
 * How many turns may sit between the summary and the recent window before it
 * is refreshed. With a 10-message history window, 6 + 4 keeps every turn
 * after the summary inside what loadHistory sends: nothing falls into a gap.
 */
export const SUMMARY_REFRESH_AFTER = 4;

/** Summariser input. Enough for the refresh batch on a free-tier Groq minute. */
const SOURCE_CHAR_BUDGET = 12_000;
const MESSAGE_CHAR_CAP = 2_000;
/** Room for a short GPT-OSS think phase plus a ~350-word summary. */
const SUMMARY_MAX_TOKENS = 1_200;
const MAX_SUMMARY_CHARS = 6_000;
const MIN_SUMMARY_CHARS = 20;

const SUMMARY_INSTRUCTION = `You keep the running memory of a chat between a user and Ken AI.
Rewrite the summary so it covers the previous summary (if any) plus the new messages.

Keep: the user's goals and requirements, decisions and why they were made, facts the user stated, names that matter (files, functions, variables, libraries, versions, numbers), what is finished, and what is still open.
Drop: greetings, filler, repetition, and the wording of explanations already given.
Code: never copy code. Name the file or function and say what it does or what changed.

Format: short bullet points under the headings Goal, Decisions, Details, Open items. Leave out empty headings.
At most 350 words. Write in the language the user writes in. Reply with the summary only.`;

interface StoredSummary {
  text: string;
  throughMessageId: mongoose.Types.ObjectId;
  throughCreatedAt: Date;
}

/** Conversations with a refresh already running, so two quick turns cannot race. */
const inFlight = new Set<string>();

/** Wraps the stored summary as the system message the model receives. */
export function summaryMessage(text: string): ChatMessage {
  return {
    role: "system",
    kind: "summary",
    content: `Summary of the earlier part of this conversation. The older messages themselves are not shown; treat this as background you already know. The messages after it are the most recent ones, word for word.\n\n${text}`,
  };
}

/** Mongo filter for the messages strictly after the summary's last covered message. */
export function messagesAfter(summary: Pick<StoredSummary, "throughMessageId" | "throughCreatedAt">) {
  return {
    $or: [
      { createdAt: { $gt: summary.throughCreatedAt } },
      { createdAt: summary.throughCreatedAt, _id: { $gt: summary.throughMessageId } },
    ],
  };
}

/**
 * The stored summary, if it still describes the live thread.
 *
 * An edit or regenerate at or before the summary's last covered message
 * supersedes that message, and the summary then describes a branch that no
 * longer exists. It is ignored rather than deleted: the next refresh replaces it.
 */
export async function activeSummary(userId: string, conversationId: string): Promise<StoredSummary | undefined> {
  if (!mongoose.isValidObjectId(conversationId)) return undefined;
  const conversation = await Conversation.findOne({ _id: conversationId, userId }, { contextSummary: 1 }).lean();
  const stored = conversation?.contextSummary;
  if (!stored?.text || !stored.throughMessageId || !stored.throughCreatedAt) return undefined;
  const live = await Message.exists({
    _id: stored.throughMessageId,
    conversationId,
    "metadata.superseded": { $ne: true },
  });
  return live
    ? { text: stored.text, throughMessageId: stored.throughMessageId, throughCreatedAt: stored.throughCreatedAt }
    : undefined;
}

/**
 * Folds turns that have left the recent window into the summary.
 *
 * Runs after a reply is delivered and never throws: a failed summary only
 * means the next turn is built the way it was before this feature existed.
 */
export async function refreshConversationSummary(input: {
  userId: string;
  conversationId: string;
  providerId: string;
  modelId: string;
}): Promise<void> {
  if (inFlight.has(input.conversationId)) return;
  inFlight.add(input.conversationId);
  try {
    await refresh(input);
  } catch (error) {
    logger.warn(
      { err: toSafeError(error), conversationId: input.conversationId },
      "conversation summary refresh failed",
    );
  } finally {
    inFlight.delete(input.conversationId);
  }
}

async function refresh(input: { userId: string; conversationId: string; providerId: string; modelId: string }) {
  const conversation = await Conversation.findOne(
    { _id: input.conversationId, userId: input.userId },
    { contextSummary: 1 },
  ).lean();
  if (!conversation) return;
  const previousId = conversation.contextSummary?.throughMessageId ?? null;
  const previous = await activeSummary(input.userId, input.conversationId);

  // Newest first with a cap, so a very long thread seen for the first time
  // costs one bounded read. Turns older than the cap were already outside
  // what the model received before summaries existed.
  const newestFirst = await Message.find({
    conversationId: input.conversationId,
    userId: input.userId,
    role: { $in: ["user", "assistant"] },
    "metadata.superseded": { $ne: true },
    status: { $in: ["complete", "aborted"] },
    ...(previous ? messagesAfter(previous) : {}),
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(SUMMARY_KEEP_RECENT + 200)
    .select({ role: 1, content: 1, createdAt: 1 })
    .lean();
  const pending = [...newestFirst].reverse();
  const candidates = pending.slice(0, Math.max(0, pending.length - SUMMARY_KEEP_RECENT));
  if (candidates.length < SUMMARY_REFRESH_AFTER) return;

  const batch = fitBudget(candidates);
  const last = batch.at(-1);
  if (!last) return;

  const source = compactCodeHistory(
    batch.map((message) => ({ role: message.role as ChatMessage["role"], content: message.content ?? "" })),
    { verbatimTail: 0, stubAll: true },
  );
  const transcript = source
    .map((message) => `${message.role === "user" ? "User" : "Ken"}: ${clip(message.content)}`)
    .join("\n\n");
  const route = resolveTitleRoute(
    { providerId: input.providerId, modelId: input.modelId },
    { groq: hasEnvApiKey("groq"), cloudflare: hasEnvApiKey("cloudflare") },
  );

  const response = await aiProviderManager.generate({
    providerId: route.providerId,
    modelId: route.modelId,
    userId: input.userId,
    maxTokens: SUMMARY_MAX_TOKENS,
    // Upkeep the app chose to do, like naming a chat: not the user's quota.
    skipQuota: true,
    // Never hop: a fallback chain that opens on Gemini would spend the very
    // quota the summary exists to save. No summary is the safe outcome.
    fallbackPolicy: "none",
    reasoningEffort: "none",
    messages: [
      { role: "system", content: SUMMARY_INSTRUCTION },
      {
        role: "user",
        content: [
          previous ? `Previous summary:\n${previous.text}` : "Previous summary: none yet.",
          `New messages:\n${transcript}`,
        ].join("\n\n"),
      },
    ],
  });

  const text = stripReasoning(response.content ?? "").visible.trim().slice(0, MAX_SUMMARY_CHARS);
  if (text.length < MIN_SUMMARY_CHARS) return;

  // Conditional on the summary this run started from, so a refresh that
  // finished late cannot overwrite a newer one.
  const saved = await Conversation.updateOne(
    { _id: input.conversationId, userId: input.userId, "contextSummary.throughMessageId": previousId },
    {
      $set: {
        contextSummary: {
          text,
          throughMessageId: last._id,
          throughCreatedAt: last.createdAt,
          updatedAt: new Date(),
        },
      },
    },
  );
  logger.info(
    telemetry({
      event: "conversation_summary_refreshed",
      conversationId: input.conversationId,
      providerId: route.providerId,
      modelId: route.modelId,
      summarizedMessages: batch.length,
      sourceChars: transcript.length,
      summaryChars: text.length,
      rebuilt: !previous,
      saved: saved.modifiedCount > 0,
    }),
    "conversation summary refreshed",
  );
}

/**
 * The newest candidates that fit the summariser's input budget, oldest first.
 * The refresh cadence keeps a batch at about four turns, so in practice all of
 * them fit; the budget only bites on a long thread's first summary.
 */
function fitBudget<T extends { content?: string | null }>(candidates: T[]): T[] {
  const picked: T[] = [];
  let used = 0;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const message = candidates[index]!;
    const cost = Math.min((message.content ?? "").length, MESSAGE_CHAR_CAP);
    if (picked.length > 0 && used + cost > SOURCE_CHAR_BUDGET) break;
    picked.push(message);
    used += cost;
  }
  return picked.reverse();
}

function clip(value: string): string {
  const compact = value.trim();
  return compact.length <= MESSAGE_CHAR_CAP ? compact : `${compact.slice(0, MESSAGE_CHAR_CAP)}…`;
}
