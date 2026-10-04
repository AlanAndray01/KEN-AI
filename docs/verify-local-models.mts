// Read-only inspection of the local API configuration and its real model registry.
// Never print keys, database addresses, raw provider responses or user data.
import mongoose from "mongoose";
import { writeFileSync } from "node:fs";
import { env } from "../server/src/config/env.js";
import { modelRegistry } from "../server/src/services/ai/ModelRegistry.js";
import { WORKER_PROVIDER_IDS } from "../server/src/services/ai/workerRouting.js";
import { pickAutoRoute } from "../server/src/services/chat/autoRoute.js";
import { resolveCredentials } from "../server/src/services/ai/credentials.js";
import { runtimeCredentials } from "../server/src/services/ai/endpointPolicy.js";
import { createProviderAdapter } from "../server/src/services/ai/createProviderAdapter.js";
import { AppError } from "../server/src/utils/AppError.js";

const result: Record<string, unknown> = { checkedAt: new Date().toISOString(),
  workerMode: Boolean(env.CLOUDFLARE_WORKER_URL), sharedSecretPresent: Boolean(env.KEN_API_KEY) };
try {
  const response = await fetch("http://localhost:5000/api/health", { signal: AbortSignal.timeout(5000) });
  const health = await response.json() as { status?: string; database?: { status?: string } };
  result.localHealth = { status: response.status, healthy: health.status === "ok", databaseConnected: health.database?.status === "connected" };
} catch { result.localHealth = { reachable: false }; }
try {
  if (!env.MONGODB_URI) throw new Error("database not configured");
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  const models = await modelRegistry.listPublicModels();
  result.providers = WORKER_PROVIDER_IDS.map((providerId) => ({ providerId,
    modelIds: models.filter((model) => model.providerId === providerId).map((model) => model.id) }));
  const route = pickAutoRoute(await modelRegistry.listRoutableModels(), "quick");
  result.autoQuick = route ? { providerId: route.providerId, modelId: route.modelId } : { available: false };
  if (process.argv.includes("--chat")) {
    const targets = [route, { providerId: "gemini", modelId: "gemini-3.5-flash-lite" },
      { providerId: "gemini", modelId: "gemini-3.8-flash" }].filter((item) => item !== undefined);
    result.adapterChecks = await Promise.all(targets.map(async (target) => {
      const { providerId, modelId } = target!;
      const row: Record<string, unknown> = { providerId, modelId };
      try {
        const credentials = (await resolveCredentials(providerId))!;
        const adapter = createProviderAdapter({ id: providerId, name: credentials.name, type: credentials.type,
          credentials: runtimeCredentials(providerId, credentials) });
        const input = { modelId, messages: [{ role: "user" as const, content: "Reply with exactly OK." }],
          maxTokens: 128, reasoningEffort: "none" as const, abortSignal: AbortSignal.timeout(50_000) };
        const response = await adapter.generate(input);
        row.generateHasText = Boolean(response.content.trim());
        let content = ""; let complete = false;
        for await (const event of adapter.stream(input)) {
          if (event.type === "chunk") content += event.text ?? "";
          if (event.type === "complete") complete = true;
          if (event.type === "error") throw new Error("stream failed");
        }
        row.streamHasText = Boolean(content.trim()); row.streamComplete = complete;
        if (!row.generateHasText || !row.streamHasText || !complete) process.exitCode = 1;
      } catch (error) { row.error = error instanceof AppError ? error.code : "adapter_failed"; process.exitCode = 1; }
      return row;
    }));
  }
} catch { result.registryReadFailed = true; process.exitCode = 1; }
finally { await mongoose.disconnect(); }
writeFileSync(new URL("local-model-check.json", import.meta.url), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
