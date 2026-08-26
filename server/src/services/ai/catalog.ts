import type { ModelCapability, ProviderType } from "@aether/shared";
import {
  CLOUDFLARE_VISION_MODEL_ID,
  DEFAULT_CEREBRAS_MODEL_ID,
  DEFAULT_CLOUDFLARE_MODEL_ID,
  DEFAULT_DEEPSEEK_MODEL_ID,
  DEFAULT_GROQ_MODEL_ID,
  GROQ_QUALITY_MODEL_ID,
} from "@aether/shared";
import type { ProviderModelDescriptor } from "./AIProvider.js";

export interface BuiltInProviderDefinition {
  providerId: string;
  name: string;
  type: ProviderType;
  envKey?: string;
  defaultBaseUrl?: string;
  capabilities: ModelCapability[];
  models: ProviderModelDescriptor[];
}

const TEXT_STREAM: ModelCapability[] = ["text", "streaming"];

export const BUILT_IN_PROVIDERS: BuiltInProviderDefinition[] = [
  {
    providerId: "groq",
    name: "Groq",
    type: "groq",
    envKey: "GROQ_API_KEY",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    capabilities: TEXT_STREAM,
    models: [
      {
        id: DEFAULT_GROQ_MODEL_ID,
        name: "GPT OSS 20B",
        description: "Fast Groq default (replaces Llama 3.1 8B Instant)",
        capabilities: TEXT_STREAM,
        contextWindow: 131_072,
      },
      {
        id: GROQ_QUALITY_MODEL_ID,
        name: "GPT OSS 120B",
        description: "Higher-quality Groq model. Groq retired llama-3.3-70b-versatile.",
        capabilities: TEXT_STREAM,
        contextWindow: 131_072,
      },
      {
        id: "qwen/qwen3.6-27b",
        name: "Qwen 3.6 27B",
        description: "Quality alternative on Groq",
        capabilities: TEXT_STREAM,
        contextWindow: 131_072,
      },
    ],
  },
  {
    providerId: "openai",
    name: "OpenAI",
    type: "openai",
    envKey: "OPENAI_API_KEY",
    defaultBaseUrl: "https://api.openai.com/v1",
    capabilities: ["text", "vision", "streaming", "tools"],
    models: [
      {
        id: "gpt-4.1",
        name: "GPT-4.1",
        capabilities: ["text", "vision", "streaming", "tools"],
        contextWindow: 1_000_000,
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o mini",
        capabilities: ["text", "vision", "streaming", "tools"],
        contextWindow: 128_000,
      },
    ],
  },
  {
    providerId: "anthropic",
    name: "Anthropic",
    type: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    defaultBaseUrl: "https://api.anthropic.com",
    capabilities: ["text", "vision", "streaming", "tools"],
    models: [
      {
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5",
        capabilities: ["text", "vision", "streaming", "tools", "reasoning"],
        contextWindow: 200_000,
      },
    ],
  },
  {
    providerId: "openrouter",
    name: "OpenRouter",
    type: "openrouter",
    envKey: "OPENROUTER_API_KEY",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    capabilities: ["text", "streaming", "tools"],
    models: [
      {
        id: "openai/gpt-4o-mini",
        name: "GPT-4o mini (OpenRouter)",
        capabilities: ["text", "streaming", "tools"],
        contextWindow: 128_000,
      },
    ],
  },
  {
    providerId: "cerebras",
    name: "Cerebras",
    type: "openai-compatible",
    envKey: "CEREBRAS_KEYS",
    defaultBaseUrl: "https://api.cerebras.ai/v1",
    capabilities: TEXT_STREAM,
    models: [
      {
        id: DEFAULT_CEREBRAS_MODEL_ID,
        name: "Llama 3.3 70B (Cerebras)",
        capabilities: TEXT_STREAM,
        contextWindow: 128_000,
      },
    ],
  },
  {
    providerId: "deepseek",
    name: "DeepSeek",
    type: "openai-compatible",
    envKey: "DEEPSEEK_KEY",
    defaultBaseUrl: "https://api.deepseek.com",
    capabilities: TEXT_STREAM,
    models: [
      {
        id: DEFAULT_DEEPSEEK_MODEL_ID,
        name: "DeepSeek Chat",
        description: "Public DeepSeek chat model. deepseek-v4-flash aliases to this id.",
        capabilities: TEXT_STREAM,
        contextWindow: 128_000,
      },
    ],
  },
  {
    providerId: "cloudflare",
    name: "Cloudflare Workers AI",
    type: "openai-compatible",
    envKey: "CF_TOKEN",
    capabilities: ["text", "vision", "streaming"],
    models: [
      {
        id: DEFAULT_CLOUDFLARE_MODEL_ID,
        name: "Llama 3.2 3B (Cloudflare)",
        capabilities: TEXT_STREAM,
        contextWindow: 128_000,
      },
      {
        id: CLOUDFLARE_VISION_MODEL_ID,
        name: "Llama 4 Scout (Cloudflare)",
        description: "Used for image prompts when Cloudflare is configured.",
        capabilities: ["text", "vision", "streaming"],
        contextWindow: 128_000,
      },
    ],
  },
  {
    providerId: "ollama",
    name: "Ollama",
    type: "ollama",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    capabilities: TEXT_STREAM,
    models: [
      {
        id: "llama3.2",
        name: "Llama 3.2",
        capabilities: TEXT_STREAM,
        contextWindow: 128_000,
      },
    ],
  },
];

export function getBuiltInProvider(providerId: string): BuiltInProviderDefinition | undefined {
  return BUILT_IN_PROVIDERS.find((item) => item.providerId === providerId);
}
