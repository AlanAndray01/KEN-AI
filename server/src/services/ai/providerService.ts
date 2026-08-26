import type {
  PublicAIProvider,
  PublicCredentialTest,
  PublicUserCredential,
  ProviderType,
} from "@Ken/shared";
import type { z } from "zod";
import mongoose from "mongoose";
import type {
  patchModelSchema,
  patchProviderSchema,
  testProviderSchema,
  upsertProviderSchema,
  upsertUserCredentialSchema,
} from "@Ken/shared";
import { AIModel } from "../../models/AIModel.js";
import { AIProvider } from "../../models/AIProvider.js";
import { UserProviderCredential } from "../../models/UserProviderCredential.js";
import { AppError } from "../../utils/AppError.js";
import { BUILT_IN_PROVIDERS, getBuiltInProvider } from "./catalog.js";
import { createProviderAdapter } from "./createProviderAdapter.js";
import {
  describeConfiguredSecret,
  loadGlobalProvider,
  loadGlobalProviders,
  resolveCredentials,
} from "./credentials.js";
import { canPersistSecrets, encryptSecret, lastFour } from "./encryption.js";
import { isMockAiAllowed } from "./providers/MockProvider.js";
import { modelRegistry } from "./ModelRegistry.js";

type UpsertProviderInput = z.infer<typeof upsertProviderSchema>;
type PatchProviderInput = z.infer<typeof patchProviderSchema>;
type TestProviderInput = z.infer<typeof testProviderSchema>;
type PatchModelInput = z.infer<typeof patchModelSchema>;
type UpsertUserCredentialInput = z.infer<typeof upsertUserCredentialSchema>;

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || `provider-${Date.now().toString(36)}`;
}

function requirePersistableSecret(): void {
  if (!canPersistSecrets()) {
    throw new AppError("ENCRYPTION_KEY is required to store provider credentials", {
      statusCode: 500,
      code: "ENCRYPTION_NOT_CONFIGURED",
    });
  }
}

function needsBaseUrl(type: ProviderType): boolean {
  return type === "ollama" || type === "openai-compatible" || type === "custom";
}

export async function listPublicProviders(userId?: string): Promise<PublicAIProvider[]> {
  return listProviders(userId, false);
}

export async function listAdminProviders(): Promise<PublicAIProvider[]> {
  return listProviders(undefined, true);
}

async function listProviders(userId: string | undefined, includeDisabled: boolean): Promise<PublicAIProvider[]> {
  const stored = await loadGlobalProviders();
  const ids = new Set<string>([
    ...BUILT_IN_PROVIDERS.map((item) => item.providerId),
    ...stored.map((item) => item.providerId),
  ]);
  if (isMockAiAllowed()) ids.add("mock");

  const providers: PublicAIProvider[] = [];
  for (const providerId of ids) {
    const record = stored.find((item) => item.providerId === providerId);
    const builtIn = getBuiltInProvider(providerId);
    const enabled = record?.enabled ?? Boolean(builtIn || providerId === "mock");
    if (!includeDisabled && !enabled) continue;

    const secret = await describeConfiguredSecret(providerId, userId);
    const type = record?.type ?? builtIn?.type ?? "custom";
    const baseUrl = record?.baseUrl ?? builtIn?.defaultBaseUrl;
    providers.push({
      id: record?.id ?? providerId,
      providerId,
      name: record?.name ?? builtIn?.name ?? providerId,
      type,
      ...(baseUrl ? { baseUrl } : {}),
      enabled,
      configured: secret.configured,
      ...(secret.keyLastFour ? { keyLastFour: secret.keyLastFour } : {}),
      capabilities: record?.capabilities.length
        ? record.capabilities
        : (builtIn?.capabilities ?? ["text"]),
      ...(record?.lastTestStatus ? { lastTestStatus: record.lastTestStatus } : {}),
      ...(record?.lastTestMessage ? { lastTestMessage: record.lastTestMessage } : {}),
      source: secret.source,
    });
  }

  return providers.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createProvider(input: UpsertProviderInput): Promise<PublicAIProvider> {
  const providerId = (input.providerId ?? slugify(input.name)).toLowerCase();
  const existing = await AIProvider.findOne({ providerId });
  if (existing) {
    throw new AppError("Provider already exists", { statusCode: 409, code: "PROVIDER_EXISTS" });
  }

  if (needsBaseUrl(input.type) && !input.baseUrl) {
    throw new AppError("Base URL is required for this provider type", {
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  }

  const created = await AIProvider.create({
    providerId,
    name: input.name,
    type: input.type,
    ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
    enabled: input.enabled ?? true,
    capabilities: getBuiltInProvider(providerId)?.capabilities ?? ["text", "streaming"],
    ...(input.apiKey ? encryptedKeyFields(input.apiKey) : {}),
  });

  if (input.models) {
    for (const model of input.models) {
      await AIModel.create({
        modelId: model.modelId,
        providerId,
        name: model.name,
        ...(model.description ? { description: model.description } : {}),
        ...(model.capabilities ? { capabilities: model.capabilities } : {}),
        ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
        enabled: true,
      });
    }
  }

  return toPublicFromRecord(created.providerId);
}

export async function updateProvider(id: string, input: PatchProviderInput): Promise<PublicAIProvider> {
  const doc = await findProviderDoc(id);
  if (input.name) doc.name = input.name;
  if (input.enabled !== undefined) doc.enabled = input.enabled;
  if (input.baseUrl !== undefined) {
    doc.set("baseUrl", input.baseUrl === "" ? null : input.baseUrl);
  }
  if (input.apiKey) {
    const fields = encryptedKeyFields(input.apiKey);
    doc.set("encryptedApiKey", fields.encryptedApiKey);
    doc.keyLastFour = fields.keyLastFour;
  }
  await doc.save();
  return toPublicFromRecord(doc.providerId);
}

export async function deleteProvider(id: string): Promise<void> {
  const doc = await findProviderDoc(id);
  await AIModel.deleteMany({ providerId: doc.providerId });
  await doc.deleteOne();
}

export async function testProviderConnection(
  id: string,
  input: TestProviderInput = {},
): Promise<PublicAIProvider> {
  const doc = await findProviderDoc(id);
  const resolved = await resolveCredentials(doc.providerId);
  const apiKey = input.apiKey ?? resolved?.apiKey;
  const baseUrl = input.baseUrl || resolved?.baseUrl;
  const adapter = createProviderAdapter({
    id: doc.providerId,
    name: doc.name,
    type: doc.type,
    credentials: {
      ...(apiKey ? { apiKey } : {}),
      ...(baseUrl ? { baseUrl } : {}),
    },
  });

  const result = await adapter.validateCredentials({
    ...(apiKey ? { apiKey } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  });

  doc.lastTestStatus = result.status;
  doc.lastTestedAt = new Date();
  doc.lastTestMessage = result.message.slice(0, 200);
  await doc.save();
  return toPublicFromRecord(doc.providerId);
}

export async function testUserCredential(
  userId: string,
  providerId: string,
  input: TestProviderInput = {},
): Promise<PublicCredentialTest> {
  if (providerId === "gemini") {
    throw new AppError("Gemini is no longer supported. Use Groq or an OpenAI-compatible provider.", {
      statusCode: 400,
      code: "PROVIDER_REMOVED",
    });
  }

  const builtIn = getBuiltInProvider(providerId);
  const stored = await loadGlobalProvider(providerId);
  if (!builtIn && !stored) {
    throw new AppError("Provider not found", { statusCode: 404, code: "PROVIDER_NOT_FOUND" });
  }

  const name = stored?.name ?? builtIn?.name ?? providerId;
  const type = stored?.type ?? builtIn?.type ?? "custom";
  const resolved = await resolveCredentials(providerId, userId);
  const apiKey = input.apiKey ?? resolved?.apiKey;
  const baseUrl = input.baseUrl || resolved?.baseUrl || builtIn?.defaultBaseUrl;
  const adapter = createProviderAdapter({
    id: providerId,
    name,
    type,
    credentials: {
      ...(apiKey ? { apiKey } : {}),
      ...(baseUrl ? { baseUrl } : {}),
    },
  });

  const result = await adapter.validateCredentials({
    ...(apiKey ? { apiKey } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  });

  return { status: result.status, message: result.message };
}

export async function patchModel(providerId: string, modelId: string, input: PatchModelInput) {
  let doc = await AIModel.findOne({ providerId, modelId });
  if (!doc) {
    const catalogModel = getBuiltInProvider(providerId)?.models.find((model) => model.id === modelId);
    if (!catalogModel) {
      throw new AppError("Model not found", { statusCode: 404, code: "MODEL_NOT_FOUND" });
    }
    doc = await AIModel.create({
      modelId: catalogModel.id,
      providerId,
      name: catalogModel.name,
      ...(catalogModel.description ? { description: catalogModel.description } : {}),
      capabilities: catalogModel.capabilities,
      ...(catalogModel.contextWindow ? { contextWindow: catalogModel.contextWindow } : {}),
      enabled: input.enabled ?? true,
    });
  }
  if (input.enabled !== undefined) doc.enabled = input.enabled;
  if (input.name) doc.name = input.name;
  if (input.description !== undefined) doc.description = input.description;
  await doc.save();
  const model = (await modelRegistry.listAllModels()).find(
    (item) => item.providerId === doc.providerId && item.id === doc.modelId,
  );
  if (!model) {
    throw new AppError("Model not found", { statusCode: 404, code: "MODEL_NOT_FOUND" });
  }
  return model;
}

export async function listUserCredentials(userId: string): Promise<PublicUserCredential[]> {
  const docs = await UserProviderCredential.find({ userId });
  const providers = await listPublicProviders(userId);
  const byProvider = new Map(docs.map((doc) => [doc.providerId, doc]));

  return providers.map((provider) => {
    const cred = byProvider.get(provider.providerId);
    return {
      providerId: provider.providerId,
      configured: Boolean(cred?.keyLastFour),
      enabled: cred?.enabled ?? false,
      ...(cred?.keyLastFour ? { keyLastFour: cred.keyLastFour } : {}),
      ...(cred?.baseUrl ? { baseUrl: cred.baseUrl } : {}),
    };
  });
}

export async function upsertUserCredential(
  userId: string,
  providerId: string,
  input: UpsertUserCredentialInput,
): Promise<PublicUserCredential> {
  if (providerId === "gemini") {
    throw new AppError("Gemini is no longer supported. Use Groq or an OpenAI-compatible provider.", {
      statusCode: 400,
      code: "PROVIDER_REMOVED",
    });
  }
  const known = getBuiltInProvider(providerId) ?? (await loadGlobalProvider(providerId));
  if (!known) {
    throw new AppError("Provider not found", { statusCode: 404, code: "PROVIDER_NOT_FOUND" });
  }

  const fields = encryptedKeyFields(input.apiKey);
  const doc = await UserProviderCredential.findOneAndUpdate(
    { userId, providerId },
    {
      $set: {
        ...fields,
        ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
        enabled: input.enabled ?? true,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  if (!doc) {
    throw new AppError("Provider not found", { statusCode: 404, code: "PROVIDER_NOT_FOUND" });
  }

  return {
    providerId,
    configured: true,
    enabled: doc.enabled,
    ...(doc.keyLastFour ? { keyLastFour: doc.keyLastFour } : {}),
    ...(doc.baseUrl ? { baseUrl: doc.baseUrl } : {}),
  };
}

export async function deleteUserCredential(userId: string, providerId: string): Promise<void> {
  const result = await UserProviderCredential.deleteOne({ userId, providerId });
  if (result.deletedCount === 0) {
    throw new AppError("Credential not found", { statusCode: 404, code: "CREDENTIAL_NOT_FOUND" });
  }
}

async function findProviderDoc(id: string) {
  if (mongoose.isValidObjectId(id)) {
    const byId = await AIProvider.findById(id).select("+encryptedApiKey");
    if (byId) return byId;
  }
  const byProviderId = await AIProvider.findOne({ providerId: id.toLowerCase() }).select("+encryptedApiKey");
  if (byProviderId) return byProviderId;
  throw new AppError("Provider not found", { statusCode: 404, code: "PROVIDER_NOT_FOUND" });
}

function encryptedKeyFields(apiKey: string): { encryptedApiKey: string; keyLastFour: string } {
  requirePersistableSecret();
  return {
    encryptedApiKey: encryptSecret(apiKey),
    keyLastFour: lastFour(apiKey),
  };
}

async function toPublicFromRecord(providerId: string): Promise<PublicAIProvider> {
  const [provider] = (await listAdminProviders()).filter((item) => item.providerId === providerId);
  if (!provider) {
    throw new AppError("Provider not found", { statusCode: 404, code: "PROVIDER_NOT_FOUND" });
  }
  return provider;
}

export async function listAdminModels() {
  return modelRegistry.listAllModels();
}
