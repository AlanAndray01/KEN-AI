import type { ModelCapability, ProviderType } from "@Ken/shared";
import {
  CLOUDFLARE_IMAGE_MODEL_ID,
  CLOUDFLARE_QUALITY_MODEL_ID,
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

const TEXT_STREAM_TOOLS: ModelCapability[] = ["text", "streaming", "tools"];

/**
 * The rest of the Workers AI text-generation catalogue, beyond the three
 * models the fallback chain and vision route name directly.
 *
 * Every id below was called live on this account and answered 200; context
 * windows and tool support are the figures Cloudflare's own model-search API
 * reports, not estimates. That verification is the point of the list rather
 * than a formality — of the 31 text-generation models Cloudflare advertises,
 * eight cannot be served here and are deliberately absent:
 *
 *   - Paid-plan only (403 "not available on the Workers Free plan"):
 *     deepseek-v4-flash-0731, deepseek-v4-pro-0813, kimi-k2.6, kimi-k2.7-code,
 *     glm-5.2, glm-5.3, glm-5.3-flash.
 *   - llama-3.2-11b-vision-instruct, which 403s until the account accepts a
 *     model agreement Cloudflare only exposes through its own dashboard.
 *
 * Listing those would put models in the picker that fail on every message.
 * Two more that do answer are still left out on judgement: llama-guard-3-8b is
 * a moderation classifier rather than an assistant, and gemma-7b-it-lora's
 * 3,500-token window is smaller than Ken's own system prompt budget.
 *
 * Speech, embeddings, and classification models are not chat ids and stay
 * out of this catalogue. Flux is listed below as an image-generation entry
 * (no `text`), not as a /chat/completions id.
 */
const CLOUDFLARE_EXTRA_MODELS: ProviderModelDescriptor[] = [
  {
    id: "@cf/openai/gpt-oss-120b",
    name: "GPT-OSS 120B (Cloudflare)",
    description: "Largest open-weight general model here; strong reasoning with tool support.",
    capabilities: TEXT_STREAM_TOOLS,
    contextWindow: 128_000,
  },
  {
    id: "@cf/openai/gpt-oss-20b",
    name: "GPT-OSS 20B (Cloudflare)",
    description: "Lighter GPT-OSS tier for everyday chat.",
    capabilities: TEXT_STREAM_TOOLS,
    contextWindow: 128_000,
  },
  {
    id: "@cf/qwen/qwen3.8-27b",
    name: "Qwen 3.8 27B (Cloudflare)",
    description: "262k-token window, tool calling, strong general reasoning.",
    capabilities: TEXT_STREAM_TOOLS,
    contextWindow: 262_144,
  },
  {
    id: "@cf/nvidia/nemotron-3-120b-a12b",
    name: "Nemotron 3 120B (Cloudflare)",
    description: "Large mixture-of-experts model for deep reasoning.",
    capabilities: TEXT_STREAM_TOOLS,
    contextWindow: 256_000,
  },
  {
    id: "@cf/google/gemma-4-26b-a4b-it",
    name: "Gemma 4 26B (Cloudflare)",
    description: "Google's open Gemma 4 tier with a 256k window.",
    capabilities: TEXT_STREAM_TOOLS,
    contextWindow: 256_000,
  },
  {
    id: "@cf/zai-org/glm-4.7-flash",
    name: "GLM 4.7 Flash (Cloudflare)",
    description: "Fast GLM tier with tool calling.",
    capabilities: TEXT_STREAM_TOOLS,
    contextWindow: 131_072,
  },
  {
    id: "@cf/ibm-granite/granite-4.0-h-micro",
    name: "Granite 4.0 H Micro (Cloudflare)",
    description: "Small IBM Granite model for quick, cheap turns.",
    capabilities: TEXT_STREAM_TOOLS,
    contextWindow: 131_000,
  },
  {
    id: "@cf/mistralai/mistral-small-3.1-24b-instruct",
    name: "Mistral Small 3.1 24B (Cloudflare)",
    description: "Balanced Mistral tier with tool calling.",
    capabilities: TEXT_STREAM_TOOLS,
    contextWindow: 128_000,
  },
  {
    id: "@cf/qwen/qwen3-30b-a3b-fp8",
    name: "Qwen 3 30B A3B (Cloudflare)",
    description: "Mixture-of-experts Qwen tier with tool calling.",
    capabilities: TEXT_STREAM_TOOLS,
    contextWindow: 32_768,
  },
  {
    id: "@cf/qwen/qwen2.5-coder-32b-instruct",
    name: "Qwen 2.5 Coder 32B (Cloudflare)",
    description: "Code-specialised model for generation and refactoring.",
    capabilities: TEXT_STREAM,
    contextWindow: 32_768,
  },
  {
    id: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
    name: "DeepSeek R1 Distill 32B (Cloudflare)",
    description: "Reasoning-distilled DeepSeek R1 for step-by-step problems.",
    capabilities: TEXT_STREAM,
    contextWindow: 80_000,
  },
  {
    id: "@cf/qwen/qwq-32b",
    name: "QwQ 32B (Cloudflare)",
    description: "Reasoning-focused Qwen variant. 24k combined input and output.",
    capabilities: TEXT_STREAM,
    contextWindow: 24_000,
  },
  {
    id: "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
    name: "SEA-LION v4 27B (Cloudflare)",
    description: "Gemma-based model tuned for South-East Asian languages.",
    capabilities: TEXT_STREAM,
    contextWindow: 128_000,
  },
  {
    id: "@cf/meta/llama-3.1-8b-instruct-fp8",
    name: "Llama 3.1 8B (Cloudflare)",
    description: "Small, quick Llama tier.",
    capabilities: TEXT_STREAM,
    contextWindow: 32_000,
  },
  {
    id: "@cf/meta/llama-3.2-1b-instruct",
    name: "Llama 3.2 1B (Cloudflare)",
    description: "Smallest Llama tier; fastest and cheapest here.",
    capabilities: TEXT_STREAM,
    contextWindow: 60_000,
  },
  {
    id: "@cf/mistral/mistral-7b-instruct-v0.2-lora",
    name: "Mistral 7B Instruct (Cloudflare)",
    description: "Legacy Mistral 7B tier.",
    capabilities: TEXT_STREAM,
    contextWindow: 15_000,
  },
  {
    id: "@cf/google/gemma-2b-it-lora",
    name: "Gemma 2B (Cloudflare)",
    description: "Very small Gemma tier for short turns.",
    capabilities: TEXT_STREAM,
    contextWindow: 8_192,
  },
  {
    id: "@cf/meta-llama/llama-2-7b-chat-hf-lora",
    name: "Llama 2 7B Chat (Cloudflare)",
    description: "Legacy Llama 2 chat tier.",
    capabilities: TEXT_STREAM,
    contextWindow: 8_192,
  },
];

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
        name: "Qwen 3.8 27B",
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
    capabilities: ["text", "vision", "files", "streaming", "tools"],
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
    providerId: "openrouter",
    name: "OpenRouter",
    type: "openrouter",
    envKey: "OPENROUTER_API_KEY",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    capabilities: ["text", "vision", "streaming", "tools"],
    models: [
      {
        id: "openai/gpt-4o-mini",
        name: "GPT-4o mini (OpenRouter)",
        capabilities: ["text", "vision", "streaming", "tools"],
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
    // Context windows below are each model's real ceiling from Cloudflare's own
    // model pages, not a shared placeholder — they differ by nearly 5x across
    // this one provider (24k for 70B vs 131k for Scout), and ContextManager
    // reads this value per hop via withProviderContextFit, so getting it wrong
    // here is what causes a real request to 400 once history grows.
    models: [
      {
        id: CLOUDFLARE_QUALITY_MODEL_ID,
        name: "Llama 3.3 70B (Cloudflare)",
        description: "Last-resort fallback once every other provider has failed. Real limit is 24k tokens, input and output combined.",
        capabilities: TEXT_STREAM,
        contextWindow: 24_000,
      },
      {
        id: DEFAULT_CLOUDFLARE_MODEL_ID,
        name: "Llama 3.2 3B (Cloudflare)",
        description: "Smaller and faster than the 70B fallback above; tried after it.",
        capabilities: TEXT_STREAM,
        contextWindow: 80_000,
      },
      {
        id: CLOUDFLARE_VISION_MODEL_ID,
        name: "Llama 4 Scout (Cloudflare)",
        description: "Used for image prompts when Cloudflare is configured.",
        capabilities: ["text", "vision", "streaming"],
        contextWindow: 131_000,
      },
      ...CLOUDFLARE_EXTRA_MODELS,
      {
        id: CLOUDFLARE_IMAGE_MODEL_ID,
        name: "Flux 1 Schnell (Cloudflare)",
        description: "Image generation. Every prompt is drawn; this is not a chat model.",
        capabilities: ["imageGeneration"],
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
