import type { PublicUsageByGroup, PublicUsageRecord, PublicUsageSummary } from "@aether/shared";
import { logger } from "../../config/logger.js";
import { UsageRecord } from "../../models/UsageRecord.js";
import { toSafeError } from "../../utils/redact.js";

export async function recordUsage(input: {
  userId: string;
  providerId: string;
  modelId: string;
  conversationId?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
  success: boolean;
  errorCode?: string;
  route: string;
}): Promise<void> {
  try {
    await UsageRecord.create({
      userId: input.userId,
      providerId: input.providerId,
      modelId: input.modelId,
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      requestCount: 1,
      ...(input.inputTokens !== undefined ? { inputTokens: input.inputTokens } : {}),
      ...(input.outputTokens !== undefined ? { outputTokens: input.outputTokens } : {}),
      durationMs: input.durationMs,
      success: input.success,
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
      route: input.route,
    });
  } catch (error) {
    logger.error({ err: toSafeError(error) }, "Failed to record usage");
  }
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function emptyTotals() {
  return { requests: 0, inputTokens: 0, outputTokens: 0, successes: 0, failures: 0 };
}

export async function summarizeUsage(filter: { userId?: string } = {}): Promise<PublicUsageSummary> {
  const match: Record<string, unknown> = {};
  if (filter.userId) {
    match.userId = filter.userId;
  }

  const [totalsRow] = await UsageRecord.aggregate<{
    requests: number;
    inputTokens: number;
    outputTokens: number;
    successes: number;
    failures: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: null,
        requests: { $sum: "$requestCount" },
        inputTokens: { $sum: { $ifNull: ["$inputTokens", 0] } },
        outputTokens: { $sum: { $ifNull: ["$outputTokens", 0] } },
        successes: { $sum: { $cond: ["$success", 1, 0] } },
        failures: { $sum: { $cond: ["$success", 0, 1] } },
      },
    },
  ]);

  const byProviderRows = await UsageRecord.aggregate<{
    _id: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    successes: number;
    failures: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: "$providerId",
        requests: { $sum: "$requestCount" },
        inputTokens: { $sum: { $ifNull: ["$inputTokens", 0] } },
        outputTokens: { $sum: { $ifNull: ["$outputTokens", 0] } },
        successes: { $sum: { $cond: ["$success", 1, 0] } },
        failures: { $sum: { $cond: ["$success", 0, 1] } },
      },
    },
    { $sort: { requests: -1 } },
  ]);

  const byModelRows = await UsageRecord.aggregate<{
    _id: { providerId: string; modelId: string };
    requests: number;
    inputTokens: number;
    outputTokens: number;
    successes: number;
    failures: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: { providerId: "$providerId", modelId: "$modelId" },
        requests: { $sum: "$requestCount" },
        inputTokens: { $sum: { $ifNull: ["$inputTokens", 0] } },
        outputTokens: { $sum: { $ifNull: ["$outputTokens", 0] } },
        successes: { $sum: { $cond: ["$success", 1, 0] } },
        failures: { $sum: { $cond: ["$success", 0, 1] } },
      },
    },
    { $sort: { requests: -1 } },
  ]);

  const recentDocs = await UsageRecord.find(match).sort({ createdAt: -1 }).limit(50);
  const recent: PublicUsageRecord[] = recentDocs.map((doc) => {
    const record: PublicUsageRecord = {
      id: String(doc._id),
      providerId: doc.providerId,
      modelId: doc.modelId,
      requestCount: doc.requestCount ?? 1,
      success: doc.success,
      createdAt: iso(doc.createdAt),
    };
    if (doc.inputTokens != null) record.inputTokens = doc.inputTokens;
    if (doc.outputTokens != null) record.outputTokens = doc.outputTokens;
    if (doc.durationMs != null) record.durationMs = doc.durationMs;
    if (doc.errorCode) record.errorCode = doc.errorCode;
    if (doc.route) record.route = doc.route;
    return record;
  });

  const byProvider: PublicUsageByGroup[] = byProviderRows.map((row) => ({
    key: row._id,
    providerId: row._id,
    requests: row.requests,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    successes: row.successes,
    failures: row.failures,
  }));

  const byModel: PublicUsageByGroup[] = byModelRows.map((row) => ({
    key: `${row._id.providerId}:${row._id.modelId}`,
    providerId: row._id.providerId,
    modelId: row._id.modelId,
    requests: row.requests,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    successes: row.successes,
    failures: row.failures,
  }));

  return {
    totals: totalsRow
      ? {
          requests: totalsRow.requests,
          inputTokens: totalsRow.inputTokens,
          outputTokens: totalsRow.outputTokens,
          successes: totalsRow.successes,
          failures: totalsRow.failures,
        }
      : emptyTotals(),
    byProvider,
    byModel,
    recent,
  };
}
