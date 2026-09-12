import { logger } from "../../config/logger.js";
import { UsageRecord } from "../../models/UsageRecord.js";
import { toSafeError } from "../../utils/redact.js";

export interface GenerationEstimate {
  /** Median duration of comparable past generations, in milliseconds. */
  estimatedMs: number;
  /** How many past generations the median came from. Fewer means a looser figure. */
  sampleSize: number;
  /** True when the samples were themselves deep-code turns rather than a general mix. */
  matchedMode: boolean;
}

/** Enough history to absorb one slow outlier without lagging a real speed change. */
const SAMPLE_LIMIT = 40;
/** Below this a median is noise, so no estimate is shown at all. */
const MIN_SAMPLES = 3;

interface DurationSample {
  durationMs?: number | null;
}

/**
 * Estimate how long this generation will take from what the same model actually
 * did on recent turns.
 *
 * Every completed generation already writes `durationMs` to UsageRecord, so this
 * is measured rather than guessed — there is no hardcoded seconds table. Deep
 * code turns are timed separately because they run materially longer; when that
 * subset is too small to be meaningful the query widens to all modes and says so
 * through `matchedMode`, which the UI uses to hedge its wording.
 *
 * Returns undefined when there is not enough history. Callers must treat the
 * estimate as optional and render nothing rather than inventing a number.
 */
export async function estimateGenerationMs(input: {
  providerId: string;
  modelId: string;
  deepCode: boolean;
}): Promise<GenerationEstimate | undefined> {
  try {
    if (input.deepCode) {
      const matched = await sampleDurations({ ...input, deepCodeFilter: true });
      if (matched.length >= MIN_SAMPLES) {
        return { estimatedMs: median(matched), sampleSize: matched.length, matchedMode: true };
      }
    }

    const general = await sampleDurations({ ...input, deepCodeFilter: false });
    if (general.length < MIN_SAMPLES) return undefined;

    return {
      estimatedMs: median(general),
      sampleSize: general.length,
      // A deep-code turn priced off general samples is an underestimate, and the
      // client is told so instead of the number being silently inflated.
      matchedMode: !input.deepCode,
    };
  } catch (error) {
    // An estimate is a nicety; never fail a generation over it.
    logger.warn({ err: toSafeError(error) }, "Generation estimate unavailable");
    return undefined;
  }
}

async function sampleDurations(input: {
  providerId: string;
  modelId: string;
  deepCodeFilter: boolean;
}): Promise<number[]> {
  const docs = await UsageRecord.find({
    providerId: input.providerId,
    modelId: input.modelId,
    success: true,
    durationMs: { $gt: 0 },
    ...(input.deepCodeFilter ? { deepCode: true } : {}),
  })
    .sort({ createdAt: -1 })
    .limit(SAMPLE_LIMIT)
    .select("durationMs")
    .lean<DurationSample[]>();

  return docs
    .map((doc) => (typeof doc.durationMs === "number" ? doc.durationMs : 0))
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
}

/** Median, not mean: one 60-second stall should not move the figure much. */
function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return Math.round(sorted[middle] ?? 0);
  const low = sorted[middle - 1] ?? 0;
  const high = sorted[middle] ?? 0;
  return Math.round((low + high) / 2);
}
