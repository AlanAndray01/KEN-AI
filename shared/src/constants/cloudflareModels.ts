// Shared by Express and the Worker so chat/image allowlists cannot drift.
import type { ModelCapability } from "../types/domain.js";
import { CLOUDFLARE_IMAGE_MODEL_ID, CLOUDFLARE_QUALITY_MODEL_ID,
  CLOUDFLARE_VISION_MODEL_ID, DEFAULT_CLOUDFLARE_MODEL_ID } from "./index.js";

export interface CloudflareModelDescriptor {
  id: string;
  name: string;
  description?: string;
  capabilities: ModelCapability[];
  contextWindow?: number;
}
const TEXT_STREAM: ModelCapability[] = ["text", "streaming"];
const TEXT_STREAM_TOOLS: ModelCapability[] = ["text", "streaming", "tools"];
// Quarantined after repeated model-side failures; remove only after a live check.
export const CLOUDFLARE_DISABLED_MODEL_IDS: readonly string[] = ["@cf/qwen/qwen3.8-27b"];

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
const CLOUDFLARE_EXTRA_MODELS: CloudflareModelDescriptor[] = [
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

export const CLOUDFLARE_MODELS: CloudflareModelDescriptor[] = [
      {
        id: CLOUDFLARE_QUALITY_MODEL_ID,
        name: "Llama 3.3 70B (Cloudflare)",
        description: "Manual quality tier. Real limit is 24k tokens, input and output combined.",
        capabilities: TEXT_STREAM,
        contextWindow: 24_000,
      },
      {
        id: DEFAULT_CLOUDFLARE_MODEL_ID,
        name: "Llama 3.2 3B (Cloudflare)",
        description: "Cheap default Cloudflare fallback tier.",
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
      // Further Workers AI text-to-image models, each verified with a live
      // generation on this free-plan account. Order is roughly fastest first.
      {
        id: "@cf/black-forest-labs/flux-2-klein-4b",
        name: "Flux 2 Klein 4B (Cloudflare)",
        description: "Image generation. Newer Flux, small and quick.",
        capabilities: ["imageGeneration"],
      },
      {
        id: "@cf/black-forest-labs/flux-2-klein-9b",
        name: "Flux 2 Klein 9B (Cloudflare)",
        description: "Image generation. Newer Flux with more detail than 4B.",
        capabilities: ["imageGeneration"],
      },
      {
        id: "@cf/black-forest-labs/flux-2-dev",
        name: "Flux 2 Dev (Cloudflare)",
        description: "Image generation. Highest-quality Flux; slowest and heaviest on the daily quota.",
        capabilities: ["imageGeneration"],
      },
      {
        id: "@cf/leonardo/lucid-origin",
        name: "Lucid Origin (Cloudflare)",
        description: "Image generation by Leonardo. Strong prompt adherence and text rendering.",
        capabilities: ["imageGeneration"],
      },
      {
        id: "@cf/leonardo/phoenix-1.0",
        name: "Phoenix 1.0 (Cloudflare)",
        description: "Image generation by Leonardo. Polished, photographic results.",
        capabilities: ["imageGeneration"],
      },
      {
        id: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
        name: "Stable Diffusion XL (Cloudflare)",
        description: "Image generation. Classic SDXL base model.",
        capabilities: ["imageGeneration"],
      },
      {
        id: "@cf/bytedance/stable-diffusion-xl-lightning",
        name: "SDXL Lightning (Cloudflare)",
        description: "Image generation. Very fast SDXL variant.",
        capabilities: ["imageGeneration"],
      },
      {
        id: "@cf/lykon/dreamshaper-8-lcm",
        name: "DreamShaper 8 (Cloudflare)",
        description: "Image generation. Stylised, artistic images.",
        capabilities: ["imageGeneration"],
      },
    ];
