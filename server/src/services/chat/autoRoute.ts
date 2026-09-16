import {
  AUTO_ROUTE_REASON,
  CLOUDFLARE_VISION_MODEL_ID,
  DEFAULT_CEREBRAS_MODEL_ID,
  DEFAULT_DEEPSEEK_MODEL_ID,
  DEFAULT_GEMINI_MODEL_ID,
  DEFAULT_GROQ_MODEL_ID,
  DEFAULT_OPENAI_MODEL_ID,
  GEMINI_FLASH_MODEL_ID,
  GEMINI_PRO_MODEL_ID,
  GROQ_OSS_20B_MODEL_ID,
  GROQ_QUALITY_MODEL_ID,
  type AutoTask,
  type ChatToolId,
  type ModelCapability,
  type PublicAIModel,
} from "@Ken/shared";
import { attachmentNeed } from "../ai/attachmentRoute.js";
import { detectDeepCodeRequest } from "./codeGeneration.js";
import { detectTaskSignals } from "./responsePolicy.js";

/**
 * Auto mode: choose a model per turn from what the request actually needs.
 *
 * This is a heuristic router, not a model call. It reuses the classifiers the
 * reply policy already runs (task signals, deep-code detection, attachment
 * needs), so routing adds no latency and no second opinion that could disagree
 * with how the reply is shaped.
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
  if ((input.enabledTools?.length ?? 0) > 0) return "tools";
  if (detectDeepCodeRequest(input.content)) return "code";
  const signals = detectTaskSignals(input.content);
  if (signals.needsMath || signals.budget === "long") return "reasoning";
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
  quick: [
    ref("gemini", DEFAULT_GEMINI_MODEL_ID),
    ref("groq", DEFAULT_GROQ_MODEL_ID),
    ref("cerebras", DEFAULT_CEREBRAS_MODEL_ID),
    ref("groq", GROQ_OSS_20B_MODEL_ID),
    ref("openai", DEFAULT_OPENAI_MODEL_ID),
  ],
  chat: [
    ref("gemini", DEFAULT_GEMINI_MODEL_ID),
    ref("gemini", GEMINI_FLASH_MODEL_ID),
    ref("groq", DEFAULT_GROQ_MODEL_ID),
    ref("openai", DEFAULT_OPENAI_MODEL_ID),
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
  vision: [
    ref("gemini", DEFAULT_GEMINI_MODEL_ID),
    ref("gemini", GEMINI_FLASH_MODEL_ID),
    ref("openai", DEFAULT_OPENAI_MODEL_ID),
    ref("cloudflare", CLOUDFLARE_VISION_MODEL_ID),
  ],
  files: [
    ref("openai", DEFAULT_OPENAI_MODEL_ID),
    ref("openai", "gpt-4.1"),
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
  vision: "vision",
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
  const required = TASK_REQUIREMENT[task];
  const eligible = models.filter(
    (model) => model.enabled !== false && model.available && model.capabilities.includes(required),
  );
  const reason = `${AUTO_ROUTE_REASON}|${task}`;

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
 * An attachment turn never degrades, because answering without the file is the
 * silent data drop the attachment gate exists to prevent.
 */
export function planAutoRoute(models: readonly RoutableModel[], input: AutoTaskInput): AutoPlan {
  const task = classifyAutoTask(input);
  const route = pickAutoRoute(models, task);
  if (route || task !== "tools") return { task, route };
  return { task: "chat", route: pickAutoRoute(models, "chat") };
}
