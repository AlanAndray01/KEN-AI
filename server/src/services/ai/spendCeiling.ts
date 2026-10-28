import { env, isTest } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { SpendBudget } from "../../models/SpendBudget.js";
import { AppError } from "../../utils/AppError.js";
import { estimateContextTokens } from "../chat/ContextManager.js";
import type { CredentialSource } from "./credentials.js";
import type { AIProvider, AIUsage, GenerateRequest } from "./AIProvider.js";
import { cloudflareMaxTokens, geminiMaxOutputTokens, groqMaxCompletionTokens } from "./providers/compatibleChatBody.js";

export interface SpendReservation { key: string; tokens: number }

/** Atomic admission survives restarts and works across instances, without a
 * fail-open Redis or per-process fallback. MongoDB is authoritative. */
export async function reserveSpend(userId: string, source: CredentialSource, tokens: number): Promise<SpendReservation | null> {
  const ceiling = env.AUTO_MODE_DAILY_TOKEN_CEILING;
  if (source === "user" || !ceiling) return null;
  const amount = Math.max(1, Math.ceil(tokens));
  const day = new Date().toISOString().slice(0, 10);
  const key = `spend:${userId}:${day}`;
  try {
    try { await SpendBudget.updateOne({ _id: key }, { $setOnInsert: {
      tokens: 0, expiresAt: new Date(new Date(`${day}T00:00:00Z`).getTime() + 2 * 86_400_000),
    } }, { upsert: true }); }
    catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
    const result = await SpendBudget.updateOne({ _id: key, tokens: { $lte: ceiling - amount } }, { $inc: { tokens: amount } });
    if (!result.modifiedCount) throw new AppError(
      "This request exceeds the remaining daily shared-key token budget. Try a shorter request or add your own provider key in Settings.",
      { statusCode: 429, code: "SPEND_CEILING_REACHED" },
    );
    return { key, tokens: amount };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Shared-key usage accounting is temporarily unavailable. Please retry later.",
      { statusCode: 503, code: "SPEND_ACCOUNTING_UNAVAILABLE" });
  }
}

export async function reconcileSpend(reservation: SpendReservation | null, usage?: AIUsage): Promise<void> {
  if (!reservation) return;
  // Unknown costs stay reserved: a disconnected provider may still bill.
  const actual = usage?.totalTokens ?? (usage?.inputTokens !== undefined && usage.outputTokens !== undefined
    ? usage.inputTokens + usage.outputTokens : undefined);
  if (actual === undefined || !Number.isFinite(actual) || actual < 0) return;
  try {
    await SpendBudget.updateOne({ _id: reservation.key }, { $inc: { tokens: Math.ceil(actual) - reservation.tokens } });
  } catch (error) {
    logger.error({ err: error }, "Spend reconciliation failed; reservation remains charged");
  }
}

/** Token admission uses an input estimate, not a vendor billing guarantee.
 * Output is capped in the dispatched request, including Gemini thinking. */
export function budgetedRequest(request: GenerateRequest): { request: GenerateRequest; tokens: number } {
  const maxTokens = request.maxTokens ?? (request.providerId === "groq" ? 1_000
    : request.providerId === "gemini" ? 1_024 : request.providerId === "cloudflare"
      ? cloudflareMaxTokens(request.modelId, request.messages) : 4_096);
  const bounded = { ...request, maxTokens };
  const output = request.providerId === "gemini" ? geminiMaxOutputTokens(maxTokens, request.reasoningEffort)
    : request.providerId === "groq" ? groqMaxCompletionTokens(request.modelId, maxTokens)
      : request.providerId === "cloudflare" ? cloudflareMaxTokens(request.modelId, request.messages, maxTokens) : maxTokens;
  return { request: bounded, tokens: Math.ceil(estimateContextTokens(request.messages) * 1.25) + output };
}

export function withSpendBudget(adapter: AIProvider, userId: string | undefined, source: CredentialSource, enforceInTests = false): AIProvider {
  if (!userId || source === "user" || !env.AUTO_MODE_DAILY_TOKEN_CEILING || (isTest && !enforceInTests)) return adapter;
  const generate = adapter.generate.bind(adapter);
  adapter.generate = async input => {
    const budget = budgetedRequest(input);
    const reservation = await reserveSpend(userId, source, budget.tokens);
    const response = await generate(budget.request);
    await reconcileSpend(reservation, response.usage);
    return response;
  };
  const stream = adapter.stream?.bind(adapter);
  if (stream) adapter.stream = async function* (input) {
    const budget = budgetedRequest(input);
    const reservation = await reserveSpend(userId, source, budget.tokens);
    let settled = false;
    for await (const event of stream(budget.request)) {
      if (event.type === "complete" && !settled) { settled = true; await reconcileSpend(reservation, event.response.usage); }
      yield event;
    }
  };
  return adapter;
}
