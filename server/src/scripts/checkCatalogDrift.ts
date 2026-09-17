import { BUILT_IN_PROVIDERS } from "../services/ai/catalog.js";
import { cloudflareBaseUrl, getEnvApiKey } from "../services/ai/credentials.js";

/**
 * Diffs the hardcoded model catalog (catalog.ts) against what each provider's
 * live /models endpoint actually serves. `validateCredentials()` already
 * calls this same endpoint, but only checks the HTTP status — it never looks
 * at which model IDs come back, so a provider silently retiring or renaming a
 * model (as Groq did with llama-3.3-70b-versatile) goes unnoticed until a
 * user's request starts failing in production.
 *
 * Run manually or on a schedule, not in required CI: it needs live platform
 * credentials and a real network call per provider, neither of which belongs
 * on every push.
 */

interface DriftReport {
  providerId: string;
  retiredIds: string[];
  newIds: string[];
}

interface SkippedReport {
  providerId: string;
  skipped: string;
}

async function fetchLiveModelIds(baseUrl: string, apiKey: string): Promise<string[]> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = (await response.json()) as { data?: Array<{ id?: string }> };
  return (body.data ?? [])
    .map((entry) => entry.id)
    .filter((id): id is string => Boolean(id))
    // Gemini's OpenAI-compat listing still returns native "models/x" ids even
    // though generateContent calls (geminiNative.ts) add that prefix
    // themselves and expect the catalog's stored ids bare — strip it here so
    // the diff compares like with like instead of flagging every Gemini
    // model as retired.
    .map((id) => id.replace(/^models\//, ""));
}

async function checkProvider(providerId: string): Promise<DriftReport | SkippedReport> {
  const builtIn = BUILT_IN_PROVIDERS.find((provider) => provider.providerId === providerId);
  if (!builtIn) return { providerId, skipped: "not a built-in provider" };

  const baseUrl =
    providerId === "cloudflare" ? (cloudflareBaseUrl() ?? builtIn.defaultBaseUrl) : builtIn.defaultBaseUrl;
  if (!baseUrl) return { providerId, skipped: "no fixed base URL (per-user or local-only provider)" };

  const apiKey = getEnvApiKey(providerId);
  if (!apiKey) return { providerId, skipped: "no platform key configured" };

  const liveIds = new Set(await fetchLiveModelIds(baseUrl, apiKey));
  const catalogIds = builtIn.models.map((model) => model.id);
  return {
    providerId,
    retiredIds: catalogIds.filter((id) => !liveIds.has(id)),
    newIds: [...liveIds].filter((id) => !catalogIds.includes(id)),
  };
}

async function main(): Promise<void> {
  const results = await Promise.all(
    BUILT_IN_PROVIDERS.map(async (provider): Promise<DriftReport | SkippedReport> => {
      try {
        return await checkProvider(provider.providerId);
      } catch (error) {
        return { providerId: provider.providerId, skipped: error instanceof Error ? error.message : "request failed" };
      }
    }),
  );

  let hasDrift = false;
  for (const result of results) {
    if ("skipped" in result) {
      console.log(`- ${result.providerId}: skipped (${result.skipped})`);
      continue;
    }
    if (result.retiredIds.length === 0 && result.newIds.length === 0) {
      console.log(`- ${result.providerId}: catalog matches the live model list`);
      continue;
    }
    if (result.retiredIds.length > 0) {
      hasDrift = true;
      console.log(`- ${result.providerId}: CATALOG HAS RETIRED MODELS -> ${result.retiredIds.join(", ")}`);
    }
    if (result.newIds.length > 0) {
      console.log(`- ${result.providerId}: live models not yet in the catalog -> ${result.newIds.join(", ")}`);
    }
  }

  if (hasDrift) {
    console.error("\nCatalog drift detected: update server/src/services/ai/catalog.ts.");
    process.exitCode = 1;
  }
}

void main();
