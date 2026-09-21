import { AppError } from "../../../utils/AppError.js";

const BLOCKED_FINISH = /^(SAFETY|RECITATION|BLOCKLIST|PROHIBITED_CONTENT|SPII|OTHER|IMAGE_SAFETY)$/i;

function promptBlockReason(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const feedback = (payload as { promptFeedback?: { blockReason?: unknown } }).promptFeedback;
  return typeof feedback?.blockReason === "string" && feedback.blockReason ? feedback.blockReason : undefined;
}

/**
 * Empty or safety-blocked Gemini payloads used to complete as a blank bubble
 * ("No reply was generated") instead of an error the client can retry.
 */
export function geminiEmptyReplyError(input: {
  text: string;
  finishReason?: string;
  payload?: unknown;
  candidateCount?: number;
}): AppError | undefined {
  const blockReason = promptBlockReason(input.payload);
  if (blockReason) {
    return blockedReplyError(blockReason);
  }
  if (input.text.trim()) return undefined;
  const finish = input.finishReason ?? "";
  if (BLOCKED_FINISH.test(finish)) return blockedReplyError(finish);
  return new AppError("The model returned an empty reply. Retry this turn.", {
    statusCode: 502,
    code: "PROVIDER_ERROR",
    expose: true,
    extra: {
      errorClass: "empty_reply",
      ...(finish ? { finishReason: finish } : {}),
      ...(input.candidateCount !== undefined ? { candidateCount: input.candidateCount } : {}),
    },
  });
}

function blockedReplyError(reason: string): AppError {
  return new AppError("Gemini blocked this reply. Retry this turn, or rephrase the request.", {
    statusCode: 502,
    code: "PROVIDER_ERROR",
    expose: true,
    extra: { errorClass: "safety", finishReason: reason },
  });
}
