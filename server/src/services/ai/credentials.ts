import type { ModelCapability, ProviderTestStatus, ProviderType } from "@Ken/shared";
import { env } from "../../config/env.js";
import { AIProvider } from "../../models/AIProvider.js";
import { UserProviderCredential } from "../../models/UserProviderCredential.js";
import { AppError } from "../../utils/AppError.js";
import { getBuiltInProvider } from "./catalog.js";
import { decryptSecret, lastFour } from "./encryption.js";
import { isMockAiAllowed } from "./providers/MockProvider.js";

export type CredentialSource = "user" | "database" | "environment";

export interface ProviderRecord {
  id: string;
  providerId: string;
  name: string;
  type: ProviderType;
  baseUrl?: string;
  enabled: boolean;
  capabilities: ModelCapability[];
  keyLastFour?: string;
  lastTestStatus?: ProviderTestStatus;
  lastTestMessage?: string;
  hasStoredKey: boolean;
}

export interface ResolvedCredentials {
  providerId: string;
  name: string;
  type: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
  configured: boolean;
  source: CredentialSource;
  keyLastFour?: string;
  capabilities: ModelCapability[];
}

import { nextPoolKey, parseKeyPool } from "./keyPool.js";

function envKeysFor(providerId: string): string[] {
  switch (providerId) {
    case "groq":
      return parseKeyPool(env.GROQ_KEYS, env.GROQ_API_KEY);
    case "cerebras":
      return parseKeyPool(env.CEREBRAS_KEYS, env.CEREBRAS_API_KEY);
    case "deepseek":
      return parseKeyPool(env.DEEPSEEK_KEY, env.DEEPSEEK_API_KEY);
    case "cloudflare":
      return parseKeyPool(env.CF_TOKEN);
    case "openai":
      return parseKeyPool(env.OPENAI_API_KEY);
    case "anthropic":
      return parseKeyPool(env.ANTHROPIC_API_KEY);
    case "openrouter":
      return parseKeyPool(env.OPENROUTER_API_KEY);
    default:
      return [];
  }
}

export function getEnvApiKey(providerId: string): string | undefined {
  if (providerId === "cloudflare" && !env.CF_ACCOUNT_ID) return undefined;
  return nextPoolKey(providerId, envKeysFor(providerId));
}

export function cloudflareBaseUrl(): string | undefined {
  if (!env.CF_ACCOUNT_ID) return undefined;
  return `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/v1`;
}

export function hasEnvApiKey(providerId: string): boolean {
  if (providerId === "cloudflare" && !env.CF_ACCOUNT_ID) return false;
  return envKeysFor(providerId).length > 0;
}

export function envKeyCount(providerId: string): number {
  if (providerId === "cloudflare" && !env.CF_ACCOUNT_ID) return 0;
  return envKeysFor(providerId).length;
}

function asProviderType(value: string): ProviderType {
  return value as ProviderType;
}

function asCapabilities(value: unknown): ModelCapability[] {
  return Array.isArray(value) ? (value as ModelCapability[]) : [];
}

export async function loadGlobalProvider(providerId: string): Promise<ProviderRecord | null> {
  const doc = await AIProvider.findOne({ providerId });
  if (!doc) return null;
  return toProviderRecord(doc);
}

export async function loadGlobalProviders(): Promise<ProviderRecord[]> {
  const docs = await AIProvider.find({});
  return docs.map((doc) => toProviderRecord(doc));
}

function toProviderRecord(doc: {
  id?: string;
  _id?: { toString(): string };
  providerId: string;
  name: string;
  type: string;
  baseUrl?: string | null;
  enabled: boolean;
  capabilities?: ModelCapability[] | null;
  keyLastFour?: string | null;
  lastTestStatus?: ProviderTestStatus | null;
  lastTestMessage?: string | null;
}): ProviderRecord {
  return {
    id: doc.id ?? String(doc._id),
    providerId: doc.providerId,
    name: doc.name,
    type: asProviderType(doc.type),
    ...(doc.baseUrl ? { baseUrl: doc.baseUrl } : {}),
    enabled: doc.enabled,
    capabilities: asCapabilities(doc.capabilities),
    ...(doc.keyLastFour ? { keyLastFour: doc.keyLastFour } : {}),
    ...(doc.lastTestStatus ? { lastTestStatus: doc.lastTestStatus } : {}),
    ...(doc.lastTestMessage ? { lastTestMessage: doc.lastTestMessage } : {}),
    hasStoredKey: Boolean(doc.keyLastFour),
  };
}

export function isProviderConfigured(input: {
  type: ProviderType;
  apiKey?: string;
  hasStoredKey?: boolean;
  hasEnvKey?: boolean;
  hasUserKey?: boolean;
  baseUrl?: string;
}): boolean {
  if (input.type === "ollama") {
    return Boolean(input.baseUrl);
  }
  return Boolean(input.apiKey || input.hasStoredKey || input.hasEnvKey || input.hasUserKey);
}

async function decryptDocKey(
  encryptedApiKey: string | null | undefined,
): Promise<string | undefined> {
  if (!encryptedApiKey) return undefined;
  return decryptSecret(encryptedApiKey);
}

export async function resolveCredentials(
  providerId: string,
  userId?: string,
): Promise<ResolvedCredentials | null> {
  if (providerId === "mock") {
    if (!isMockAiAllowed()) return null;
    return {
      providerId: "mock",
      name: "Mock AI",
      type: "custom",
      enabled: true,
      configured: true,
      source: "environment",
      capabilities: ["text", "streaming"],
    };
  }

  const builtIn = getBuiltInProvider(providerId);
  const stored = await loadGlobalProvider(providerId);
  if (!stored && !builtIn) {
    return null;
  }

  const enabled = stored?.enabled ?? true;
  const name = stored?.name ?? builtIn?.name ?? providerId;
  const type = stored?.type ?? builtIn?.type ?? "custom";
  const baseUrl =
    providerId === "cloudflare"
      ? (stored?.baseUrl ?? cloudflareBaseUrl() ?? builtIn?.defaultBaseUrl)
      : (stored?.baseUrl ?? builtIn?.defaultBaseUrl);
  const capabilities = stored?.capabilities.length ? stored.capabilities : (builtIn?.capabilities ?? []);

  if (userId) {
    const userCred = await UserProviderCredential.findOne({
      userId,
      providerId,
      enabled: true,
    }).select("+encryptedApiKey");
    const userKey = await decryptDocKey(userCred?.encryptedApiKey);
    if (userKey || (type === "ollama" && userCred?.baseUrl)) {
      const resolvedBase = userCred?.baseUrl ?? baseUrl;
      return {
        providerId,
        name,
        type,
        ...(userKey ? { apiKey: userKey } : {}),
        ...(resolvedBase ? { baseUrl: resolvedBase } : {}),
        enabled,
        configured: isProviderConfigured({
          type,
          ...(userKey ? { apiKey: userKey } : {}),
          ...(resolvedBase ? { baseUrl: resolvedBase } : {}),
        }),
        source: "user",
        ...(userCred?.keyLastFour ? { keyLastFour: userCred.keyLastFour } : {}),
        capabilities,
      };
    }
  }

  if (stored?.hasStoredKey) {
    const doc = await AIProvider.findOne({ providerId }).select("+encryptedApiKey");
    const apiKey = await decryptDocKey(doc?.encryptedApiKey);
    return {
      providerId,
      name,
      type,
      ...(apiKey ? { apiKey } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      enabled,
      configured: isProviderConfigured({
        type,
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
      }),
      source: "database",
      ...(stored.keyLastFour ? { keyLastFour: stored.keyLastFour } : {}),
      capabilities,
    };
  }

  const envKey = getEnvApiKey(providerId);
  if (envKey || (type === "ollama" && baseUrl)) {
    return {
      providerId,
      name,
      type,
      ...(envKey ? { apiKey: envKey } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      enabled,
      configured: isProviderConfigured({
        type,
        ...(envKey ? { apiKey: envKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
      }),
      source: "environment",
      ...(envKey ? { keyLastFour: lastFour(envKey) } : {}),
      capabilities,
    };
  }

  return {
    providerId,
    name,
    type,
    ...(baseUrl ? { baseUrl } : {}),
    enabled,
    configured: false,
    source: stored ? "database" : "environment",
    capabilities,
  };
}

export async function describeConfiguredSecret(
  providerId: string,
  userId?: string,
): Promise<{
  configured: boolean;
  source: CredentialSource;
  keyLastFour?: string;
  hasUserKey: boolean;
}> {
  if (userId) {
    const userCred = await UserProviderCredential.findOne({ userId, providerId, enabled: true });
    if (userCred?.keyLastFour) {
      return {
        configured: true,
        source: "user",
        keyLastFour: userCred.keyLastFour,
        hasUserKey: true,
      };
    }
  }

  const stored = await loadGlobalProvider(providerId);
  if (stored?.hasStoredKey) {
    return {
      configured: true,
      source: "database",
      ...(stored.keyLastFour ? { keyLastFour: stored.keyLastFour } : {}),
      hasUserKey: false,
    };
  }

  const envKey = getEnvApiKey(providerId);
  if (envKey) {
    return {
      configured: true,
      source: "environment",
      keyLastFour: lastFour(envKey),
      hasUserKey: false,
    };
  }

  const builtIn = getBuiltInProvider(providerId);
  const type = stored?.type ?? builtIn?.type;
  const baseUrl = stored?.baseUrl ?? builtIn?.defaultBaseUrl;
  if (type === "ollama" && baseUrl) {
    return { configured: true, source: stored ? "database" : "environment", hasUserKey: false };
  }

  return { configured: false, source: stored ? "database" : "environment", hasUserKey: false };
}

export function requireConfigured(resolved: ResolvedCredentials | null): ResolvedCredentials {
  if (!resolved || !resolved.enabled || !resolved.configured) {
    throw new AppError("No AI provider configured.", {
      statusCode: 503,
      code: "PROVIDER_NOT_CONFIGURED",
    });
  }
  return resolved;
}
