import {
  AUTO_MODEL_ID,
  AUTO_PROVIDER_ID,
  AUTO_ROUTE_REASON,
  CLOUDFLARE_IMAGE_MODEL_ID,
  CLOUDFLARE_TINY_MODEL_ID,
  CLOUDFLARE_VISION_MODEL_ID,
  DEFAULT_CLOUDFLARE_MODEL_ID,
  DEFAULT_CEREBRAS_MODEL_ID,
  DEFAULT_DEEPSEEK_MODEL_ID,
  DEFAULT_GEMINI_MODEL_ID,
  DEFAULT_GROQ_MODEL_ID,
  DEFAULT_OPENAI_MODEL_ID,
  GEMINI_FLASH_MODEL_ID,
  GEMINI_PRO_MODEL_ID,
  GROQ_OSS_20B_MODEL_ID,
  GROQ_QUALITY_MODEL_ID,
  estimatePromptTokens,
  type AutoTask,
  type ChatToolId,
  type ModelCapability,
  type PublicAIModel,
} from "@Ken/shared";
import { attachmentNeed } from "../ai/attachmentRoute.js";
import { pickAttachmentHop } from "../ai/fallbackController.js";
import { isProviderBlocked } from "../ai/modelSkip.js";
import { detectDeepCodeRequest } from "./codeGeneration.js";
import { detectImageRequest } from "./imageIntent.js";
import { detectTaskSignals } from "./responsePolicy.js";

/**
 * Point past which a turn is routed for its size rather than its difficulty.
 *
 * Sits where document-sized input actually begins rather than where the
 * narrowest provider gives out, which is only safe because the longContext
 * tier no longer lists Groq: its input budget is 6,000 tokens
 * (PROVIDER_INPUT_TOKENS in ContextManager), so anything routed there past
 * this point would arrive already trimmed. Every remaining hop clears it —
 * Gemini meters 32,000, and Cloudflare 12,000 via the unlisted-provider
 * default.
 */
const LONG_CONTEXT_TOKENS = 8_000;

/**
 * Auto mode: choose a model per turn from what the request actually needs.
 *
 * This is a heuristic router, not a model call — no tokens, no neurons. It
 * reuses the classifiers the reply policy already runs (task signals, deep-code
 * detection, attachment needs), so routing adds no latency and no second
 * opinion that could disagree with how the reply is shaped.
 */

export interface AutoTaskInput {
  content: string;
  files?: ReadonlyArray<{ mimeType: string }>;
  enabledTools?: readonly ChatToolId[];
}

/**
 * Ordered by what forces the decision. Attachments and tools are hard
 * requirements a model either meets or cannot serve, so they are settled before
 * the softer judgement of how hard the question is.
 */
export function classifyAutoTask(input: AutoTaskInput): AutoTask {
  const need = attachmentNeed([...(input.files ?? [])]);
  if (need === "files") return "files";
  if (need === "vision") return "vision";
  // A picture request is a hard requirement like an attachment: Flux runs
  // regardless of the selected chat model. Settled before tools so "draw a cat"
  // with web search also on is still an image turn.
  if (detectImageRequest(input.content)) return "image";
  if ((input.enabledTools?.length ?? 0) > 0) return "tools";
  if (detectDeepCodeRequest(input.content)) return "code";
  const signals = detectTaskSignals(input.content);
  if (signals.needsMath || signals.budget === "long") return "reasoning";
  // Checked after the harder signals — a long code request is still a code
  // request — but before the size-agnostic tiers, because those now lead with
  // Groq, whose input budget is 6,000 tokens. A pasted document past this size
  // reaches it already trimmed, which is the silent half-answer this avoids;
  // Gemini holds the whole thing.
  if (estimatePromptTokens(input.content) > LONG_CONTEXT_TOKENS) return "longContext";
  if (signals.budget === "minimal" || signals.budget === "short") return "quick";
  return "chat";
}

interface ModelRef {
  providerId: string;
  modelId: string;
}

function ref(providerId: string, modelId: string): ModelRef {
  return { providerId, modelId };
}

/**
 * Best-first candidates per task. Fast, inexpensive models lead where depth is
 * wasted (greetings, short facts, everyday chat); high-tier reasoning models
 * lead for code and multi-step problems. Only models the registry reports as
 * available are ever chosen, so a missing key simply moves down the list.
 */
export const AUTO_PREFERENCES: Readonly<Record<AutoTask, readonly ModelRef[]>> = {
  // Groq leads the two highest-volume tiers. Both need nothing but "text"
  // (TASK_REQUIREMENT below), which Groq satisfies, and it has a multi-key pool
  // plus far looser free limits than Gemini's single shared bucket — so routine
  // traffic no longer drains the one quota that vision genuinely depends on.
  // Gemini stays in the list as the next hop, not as the default.
  quick: [
    ref("groq", DEFAULT_GROQ_MODEL_ID),
    ref("cerebras", DEFAULT_CEREBRAS_MODEL_ID),
    ref("groq", GROQ_OSS_20B_MODEL_ID),
    ref("gemini", DEFAULT_GEMINI_MODEL_ID),
    ref("openai", DEFAULT_OPENAI_MODEL_ID),
    // Last hosted hops when Groq/Gemini/OpenAI are missing: 3B then 1B, never 70B.
    ref("cloudflare", DEFAULT_CLOUDFLARE_MODEL_ID),
    ref("cloudflare", CLOUDFLARE_TINY_MODEL_ID),
  ],
  chat: [
    ref("groq", DEFAULT_GROQ_MODEL_ID),
    ref("groq", GROQ_QUALITY_MODEL_ID),
    ref("gemini", DEFAULT_GEMINI_MODEL_ID),
    ref("gemini", GEMINI_FLASH_MODEL_ID),
    ref("openai", DEFAULT_OPENAI_MODEL_ID),
    ref("cloudflare", DEFAULT_CLOUDFLARE_MODEL_ID),
    ref("cloudflare", CLOUDFLARE_TINY_MODEL_ID),
  ],
  code: [
    ref("openai", "gpt-4.1"),
    ref("gemini", GEMINI_PRO_MODEL_ID),
    ref("groq", GROQ_QUALITY_MODEL_ID),
    ref("deepseek", DEFAULT_DEEPSEEK_MODEL_ID),
    ref("gemini", GEMINI_FLASH_MODEL_ID),
  ],
  reasoning: [
    ref("gemini", GEMINI_PRO_MODEL_ID),
    ref("openai", "gpt-4.1"),
    ref("groq", GROQ_QUALITY_MODEL_ID),
    ref("deepseek", DEFAULT_DEEPSEEK_MODEL_ID),
  ],
  // Ordered by context window, not by how clever the model is: the whole point
  // is holding the document. Gemini's million-token window leads, and Lite goes
  // first rather than Pro because they share that window while Lite has the
  // healthier quota. Groq is deliberately absent: its 131k model still only
  // gets a 6,000-token input budget, which is below the threshold that routes
  // here, so listing it would hand the tier a model guaranteed to truncate.
  // Cloudflare's Scout holds 131k and is the fallback once Gemini is spent.
  longContext: [
    ref("gemini", DEFAULT_GEMINI_MODEL_ID),
    ref("gemini", GEMINI_FLASH_MODEL_ID),
    ref("gemini", GEMINI_PRO_MODEL_ID),
    ref("openai", "gpt-4.1"),
    ref("cloudflare", CLOUDFLARE_VISION_MODEL_ID),
  ],
  vision: [
    ref("gemini", DEFAULT_GEMINI_MODEL_ID),
    ref("gemini", GEMINI_FLASH_MODEL_ID),
    ref("openai", DEFAULT_OPENAI_MODEL_ID),
    ref("cloudflare", CLOUDFLARE_VISION_MODEL_ID),
  ],
  // A picture request is Flux, not a caption hop. The image-only path in
  // chatService never streams a chat model for this task.
  image: [ref("cloudflare", CLOUDFLARE_IMAGE_MODEL_ID)],
  files: [
    ref("openai", DEFAULT_OPENAI_MODEL_ID),
    ref("openai", "gpt-4.1"),
    ref("gemini", DEFAULT_GEMINI_MODEL_ID),
    ref("gemini", GEMINI_FLASH_MODEL_ID),
    ref("gemini", GEMINI_PRO_MODEL_ID),
  ],
  tools: [
    ref("gemini", DEFAULT_GEMINI_MODEL_ID),
    ref("openai", DEFAULT_OPENAI_MODEL_ID),
    ref("gemini", GEMINI_FLASH_MODEL_ID),
  ],
};

/** The capability a model must declare to serve the task at all. */
const TASK_REQUIREMENT: Readonly<Record<AutoTask, ModelCapability>> = {
  quick: "text",
  chat: "text",
  code: "text",
  reasoning: "text",
  longContext: "text",
  vision: "vision",
  image: "imageGeneration",
  files: "files",
  tools: "tools",
};

/**
 * A local daemon counts as "available" from a base URL alone, whether or not
 * anything is listening, so it only serves Auto when no hosted model can.
 */
const LAST_RESORT_PROVIDERS: ReadonlySet<string> = new Set(["ollama"]);

export type RoutableModel = Pick<PublicAIModel, "id" | "providerId" | "capabilities" | "available" | "enabled">;

export interface AutoRoute {
  providerId: string;
  modelId: string;
  task: AutoTask;
  /** `AUTO_ROUTE|<task>`, carried on the SSE model event and in logs. */
  reason: string;
  /** False when no listed candidate was available and the first capable model was used. */
  preferred: boolean;
}

export function pickAutoRoute(models: readonly RoutableModel[], task: AutoTask): AutoRoute | undefined {
  const blocked = models.map((model) => model.providerId).filter((id) => isProviderBlocked(id));
  const reason = `${AUTO_ROUTE_REASON}|${task}`;

  if (task === "vision" || task === "files") {
    const picked = pickAttachmentHop(
      models,
      { providerId: AUTO_PROVIDER_ID, modelId: AUTO_MODEL_ID },
      task,
      { blockedProviders: blocked, preferred: AUTO_PREFERENCES[task] },
    );
    if (!picked) return undefined;
    const preferred = AUTO_PREFERENCES[task].some(
      (candidate) => candidate.providerId === picked.providerId && candidate.modelId === picked.modelId,
    );
    return {
      providerId: picked.providerId,
      modelId: picked.modelId,
      task,
      reason,
      preferred,
    };
  }

  const required = TASK_REQUIREMENT[task];
  const eligible = models.filter(
    (model) =>
      model.enabled !== false &&
      model.available &&
      model.capabilities.includes(required) &&
      !isProviderBlocked(model.providerId),
  );

  for (const candidate of AUTO_PREFERENCES[task]) {
    const match = eligible.find(
      (model) => model.providerId === candidate.providerId && model.id === candidate.modelId,
    );
    if (match) return { providerId: match.providerId, modelId: match.id, task, reason, preferred: true };
  }

  const fallback = eligible.find((model) => !LAST_RESORT_PROVIDERS.has(model.providerId)) ?? eligible[0];
  if (!fallback) return undefined;
  return { providerId: fallback.providerId, modelId: fallback.id, task, reason, preferred: false };
}

export interface AutoPlan {
  task: AutoTask;
  route: AutoRoute | undefined;
}

/**
 * Classify, then pick. A tools turn with no tool-capable model degrades to plain
 * chat rather than failing: the tool is an enhancement, not the request itself.
 * A PDF turn with no native-document model degrades to chat so server-side text
 * extraction can still serve the file. An image attachment or image-generation
 * turn never degrades — answering without the picture is the silent drop this
 * exists to prevent.
 */
export function planAutoRoute(models: readonly RoutableModel[], input: AutoTaskInput): AutoPlan {
  const task = classifyAutoTask(input);
  const route = pickAutoRoute(models, task);
  if (route) return { task, route };
  if (task === "tools" || task === "files") {
    return { task: "chat", route: pickAutoRoute(models, "chat") };
  }
  return { task, route };
}
