import type { ModelCapability, ProviderType } from "@aether/shared";
import type { ProviderModelDescriptor } from "./AIProvider.js";

export interface BuiltInProviderDefinition {
  providerId: string;
  name: string;
  type: ProviderType;
  envKey?: "GEMINI_API_KEY" | "OPENAI_API_KEY" | "ANTHROPIC_API_KEY" | "GROQ_API_KEY" | "OPENROUTER_API_KEY";
  defaultBaseUrl?: string;
  capabilities: ModelCapability[];
  models: ProviderModelDescriptor[];
}

const TEXT_STREAM: ModelCapability[] = ["text", "streaming"];
const GEMINI_CAPS: ModelCapability[] = ["text", "vision", "files", "streaming", "tools"];

export const BUILT_IN_PROVIDERS: BuiltInProviderDefinition[] = [
  {
    providerId: "gemini",
    name: "Google Gemini",
    type: "gemini",
    envKey: "GEMINI_API_KEY",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    capabilities: GEMINI_CAPS,
    models: [
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        description: "Fast multimodal Gemini model",
        capabilities: GEMINI_CAPS,
        contextWindow: 1_000_000,
      },
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        description: "Higher-quality Gemini model",
        capabilities: [...GEMINI_CAPS, "reasoning"],
        contextWindow: 1_000_000,
      },
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        description: "Multimodal Gemini Flash",
        capabilities: GEMINI_CAPS,
        contextWindow: 1_000_000,
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
    providerId: "groq",
    name: "Groq",
    type: "groq",
    envKey: "GROQ_API_KEY",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    capabilities: TEXT_STREAM,
    models: [
      {
        id: "llama-3.3-70b-versatile",
        name: "Llama 3.3 70B",
        capabilities: TEXT_STREAM,
        contextWindow: 128_000,
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
