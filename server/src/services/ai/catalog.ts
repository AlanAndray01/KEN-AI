import type { ModelCapability, ProviderType } from "@Ken/shared";
import {
  CLOUDFLARE_VISION_MODEL_ID,
  DEFAULT_CEREBRAS_MODEL_ID,
  DEFAULT_CLOUDFLARE_MODEL_ID,
  DEFAULT_DEEPSEEK_MODEL_ID,
  DEFAULT_GEMINI_MODEL_ID,
  DEFAULT_GROQ_MODEL_ID,
  GEMINI_FLASH_2_MODEL_ID,
  GEMINI_FLASH_MODEL_ID,
  GEMINI_PRO_MODEL_ID,
  GROQ_OSS_20B_MODEL_ID,
  GROQ_QUALITY_MODEL_ID,
} from "@Ken/shared";
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

/**
 * Chat Gemini models understand images and PDFs (`inlineData`).
 * Image *generation* is `GEMINI_IMAGE_MODEL_ID` via the image tool, not a chat id.
 */
const GEMINI_CAPS: ModelCapability[] = ["text", "vision", "files", "streaming", "tools"];

export const BUILT_IN_PROVIDERS: BuiltInProviderDefinition[] = [
  {
    providerId: "gemini",
    name: "Google Gemini",
    type: "gemini",
    envKey: "GEMINI_API_KEY",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    capabilities: GEMINI_CAPS,
    models: [
      {
        id: DEFAULT_GEMINI_MODEL_ID,
        name: "Gemini 3.5 Flash Lite",
        description: "Default Ken model. Fast official Flash Lite on the Google AI Studio key — images and PDFs included.",
        capabilities: GEMINI_CAPS,
        contextWindow: 1_000_000,
      },
      {
        id: GEMINI_FLASH_MODEL_ID,
        name: "Gemini 3.8 Flash",
        description: "Current stable Flash. Higher-quality multimodal chat on the same AI Studio key.",
        capabilities: GEMINI_CAPS,
        contextWindow: 1_000_000,
      },
      {
        id: GEMINI_FLASH_2_MODEL_ID,
        name: "Gemini 3.6 Flash",
        description: "Previous-generation stable Flash. Google's documented successor to Gemini 2.5 Flash.",
        capabilities: GEMINI_CAPS,
        contextWindow: 1_000_000,
      },
      {
        id: GEMINI_PRO_MODEL_ID,
        name: "Gemini 3.1 Pro",
        description: "Official Pro for complex reasoning and long context. Same GEMINI_API_KEY as Flash.",
        capabilities: GEMINI_CAPS,
        contextWindow: 1_000_000,
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
        id: DEFAULT_GROQ_MODEL_ID,
        name: "Qwen 3.6 27B",
        description: "Default Groq model. Reasoning is off, so greetings and short replies start in under a second.",
        capabilities: TEXT_STREAM,
        contextWindow: 131_072,
      },
      {
        id: GROQ_OSS_20B_MODEL_ID,
        name: "GPT OSS 20B",
        description: "Reasoning model; Ken uses low effort so the first visible token is not delayed by a long think phase.",
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
        capabilities: ["text", "vision", "files", "streaming", "tools"],
        contextWindow: 1_000_000,
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o mini",
        capabilities: ["text", "vision", "files", "streaming", "tools"],
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
        description: "Official Anthropic API. Requires ANTHROPIC_API_KEY — there is no public free Claude proxy in Ken.",
        capabilities: ["text", "vision", "files", "streaming", "tools", "reasoning"],
        contextWindow: 200_000,
      },
      {
        id: "claude-opus-4-1",
        name: "Claude Opus 4.1",
        description: "Highest-quality official Anthropic model. Paid developer tier.",
        capabilities: ["text", "vision", "files", "streaming", "tools", "reasoning"],
        contextWindow: 200_000,
      },
      {
        id: "claude-haiku-4-5",
        name: "Claude Haiku 4.5",
        description: "Fast official Anthropic model. Same ANTHROPIC_API_KEY as Sonnet and Opus.",
        capabilities: ["text", "vision", "files", "streaming", "tools"],
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
