import type { ChatToolId, PublicAIModel } from "@Ken/shared";
import {
  AUTO_MODEL_ID,
  AUTO_PROVIDER_ID,
  resolveDeepSeekModelId,
  resolveGeminiModelId,
  resolveGroqModelId,
  isAutoSelection,
  isCloudflareImageModel,
  type AutoTask,
} from "@Ken/shared";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/AppError.js";
import { telemetry } from "../../utils/telemetry.js";
import type { ChatMessage } from "../ai/AIProvider.js";
import { aiProviderManager } from "../ai/AIProviderManager.js";
import { attachmentNeed } from "../ai/attachmentRoute.js";
import { pickAttachmentHop } from "../ai/fallbackController.js";
import { isProviderBlocked } from "../ai/modelSkip.js";
import { modelRegistry } from "../ai/ModelRegistry.js";
import { describeSelectedModel } from "./identity.js";
import { planAutoRoute } from "./autoRoute.js";
import { classifyNeuronTier, downshiftForNeurons, NEURON_GUARD_REASON, type NeuronTier } from "./neuronGuardrail.js";
import { ensureImageGenerationTool, withImageGenerationTool } from "./imageIntent.js";
import { assertAttachmentsAllowed, loadOwnedFiles } from "../storage/fileService.js";

type OwnedFile = Awaited<ReturnType<typeof loadOwnedFiles>>[number];

export type TurnFile = { mimeType: string; originalName: string };

export interface PrepareTurnInput {
  userId: string;
  content: string;
  providerId: string;
  modelId: string;
  files?: ReadonlyArray<TurnFile>;
  enabledTools?: ChatToolId[];
  abortSignal?: AbortSignal;
  /**
   * The user is sending a picture the composer's Generate button already made.
   * Its draft still reads like a creation request, so only an explicit tool
   * toggle may generate again.
   */
  skipImageIntent?: boolean;
}

export interface PreparedTurn {
  providerId: string;
  modelId: string;
  modelName: string;
  /** Sentinel `auto` when Auto chose the model, so the next turn stays on Auto. */
  threadProviderId: string;
  threadModelId: string;
  imageOnly: boolean;
  imageGenerated: boolean;
  generatedFileIds: string[];
  generatedFiles: OwnedFile[];
  contextWindow?: number;
  toolSystemMessages?: ChatMessage[];
  routedFrom?: string;
  routeReason?: string;
  autoTask?: AutoTask;
  neuronTier: NeuronTier;
}

interface ResolvedModel {
  providerId: string;
  modelId: string;
  model: PublicAIModel;
}

interface AutoResolution extends ResolvedModel {
  autoTask: AutoTask;
  routeReason: string;
}

/**
 * Shared Auto / tools / Flux / attachment setup for send, edit, and regenerate.
 *
 * Tools run before the attachment route so a generated picture can move a
 * text-only selection (Groq, etc.) onto a vision model, the same way an
 * uploaded image does. Running the route first left Flux's output failing
 * assertAttachmentsAllowed on the model the user had typed with. Image-only
 * turns stay on Flux and never re-route the JPEG onto a caption model.
 */
export async function prepareTurn(input: PrepareTurnInput): Promise<PreparedTurn> {
  const userFiles = input.files ?? [];
  const enabledTools = input.skipImageIntent
    ? input.enabledTools && input.enabledTools.length > 0 ? [...input.enabledTools] : undefined
    : withImageGenerationTool(input.content, input.enabledTools);
  const autoPlan = isAutoSelection(input.providerId, input.modelId)
    ? await routeAuto(input.userId, {
        content: input.content,
        files: userFiles,
        ...(enabledTools ? { enabledTools } : {}),
      })
    : undefined;
  const requested = autoPlan ?? (await resolveExecutionModel(input.userId, input.providerId, input.modelId));
  const imageOnly = isImageOnlyTurn(requested.modelId, autoPlan?.autoTask);
  const toolsForTurn = imageOnly ? ensureImageGenerationTool(enabledTools) : enabledTools;
  const generates = Boolean(toolsForTurn?.includes("image_generation"));
  // Everything that can reject this turn runs before an image is generated,
  // so a refusal never costs image quota, storage, or a provider call.
  if (generates && userFiles.length > 0) {
    if (imageOnly) {
      throw new AppError(
        "Image generation can't use attachments. Remove the file to generate a picture, or choose a vision model to ask about it.",
        { statusCode: 400, code: "IMAGE_INPUT_UNSUPPORTED", expose: true },
      );
    }
    const preRouted = await routeForAttachments(input.userId, requested, [...userFiles]);
    assertAttachmentsAllowed(preRouted.model.capabilities, [...userFiles]);
  }
  input.abortSignal?.throwIfAborted();
  const toolOutcome =
    toolsForTurn && toolsForTurn.length > 0
      ? await aiProviderManager.applyEnabledTools({
          content: input.content,
          userId: input.userId,
          capabilities: imageOnly ? ["imageGeneration"] : requested.model.capabilities,
          enabledTools: toolsForTurn,
          ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
          // A pinned Flux selection must be answered by Flux. Auto and
          // chat-detected pictures may fail over; the file records the producer.
          ...(imageOnly && !autoPlan
            ? { imageProviderId: requested.providerId, imageModelId: requested.modelId }
            : {}),
        })
      : { systemMessages: [], files: [] };
  input.abortSignal?.throwIfAborted();
  const generatedIds = toolOutcome.files.map((file) => file.id);
  if (imageOnly && generatedIds.length === 0) {
    throw imageGenerationEmptyError();
  }
  if (imageOnly || generatedIds.length > 0) {
    logger.info(
      telemetry({
        event: "image_turn",
        providerId: requested.providerId,
        modelId: requested.modelId,
        imageOnly,
        imageGenerated: generatedIds.length > 0,
        generatedCount: generatedIds.length,
        autoTask: autoPlan?.autoTask,
      }),
      "chat image turn prepared",
    );
  }
  const generatedFiles = generatedIds.length > 0 ? await loadOwnedFiles(input.userId, generatedIds) : [];
  const filesForRoute = imageOnly ? [...userFiles] : [...userFiles, ...generatedFiles];
  const routed = imageOnly ? requested : await routeForAttachments(input.userId, requested, filesForRoute);
  if (filesForRoute.length > 0) {
    assertAttachmentsAllowed(routed.model.capabilities, filesForRoute);
  }
  const trail = routeTrail(imageOnly ? {} : routed, autoPlan);
  // Lite downshift and greetings-as-lite pruning are Auto-only. A pinned 70B
  // or Pro selection must run as that model, including on "hi".
  const neuronTier = autoPlan ? classifyNeuronTier(autoPlan.autoTask) : "large";
  // On an image-only turn the picture is the reply, so the message is labelled
  // with the backend that actually drew it — after a failover that is not the
  // one Auto first chose.
  const producer = imageOnly ? imageProducer(generatedFiles[0]) : undefined;
  const label = producer && producer.modelId !== routed.modelId ? producer : undefined;
  return {
    providerId: label?.providerId ?? routed.providerId,
    modelId: label?.modelId ?? routed.modelId,
    modelName: label ? describeSelectedModel(label.modelId) : describeSelectedModel(routed.modelId, routed.model.name),
    threadProviderId: autoPlan ? AUTO_PROVIDER_ID : routed.providerId,
    threadModelId: autoPlan ? AUTO_MODEL_ID : routed.modelId,
    imageOnly,
    imageGenerated: generatedIds.length > 0,
    generatedFileIds: generatedIds,
    generatedFiles,
    neuronTier,
    ...(routed.model.contextWindow ? { contextWindow: routed.model.contextWindow } : {}),
    ...withToolMessages(imageOnly ? [] : toolOutcome.systemMessages, !imageOnly && generatedIds.length > 0),
    ...trail,
  };
}

/**
 * Resolve the Auto picker option to a concrete model for this turn.
 *
 * Only models the registry reports as available are considered, so Auto can
 * never select something the configured keys cannot serve.
 */
async function routeAuto(
  userId: string,
  input: { content: string; files: ReadonlyArray<{ mimeType: string }>; enabledTools?: readonly ChatToolId[] },
): Promise<AutoResolution> {
  const models = await modelRegistry.listPublicModels(userId);
  const plan = planAutoRoute(models, input);
  if (!plan.route) {
    const message =
      plan.task === "files"
        ? "No configured model can read this document. Add an API key, or pick a model, then send again."
        : plan.task === "vision"
          ? "No configured model can read this image. Add a Gemini or OpenAI key, or pick a model, then send again."
          : plan.task === "image"
            ? "Image generation isn't turned on for this site yet, so Auto has no image model to use."
            : "No model is available for Auto right now. Providers may be unavailable or over quota. Check provider configuration, then retry or select an available model.";
    throw new AppError(message, { statusCode: 503, code: "AUTO_ROUTE_UNAVAILABLE", expose: true });
  }
  const route = applyLiteDownshift(plan.route, models, plan.task);
  const model =
    models.find((item) => item.providerId === route.providerId && item.id === route.modelId) ??
    (await modelRegistry.assertModelAvailable(route.providerId, route.modelId, userId));
  logger.info(
    telemetry({
      event: "auto_route",
      task: route.task,
      providerId: route.providerId,
      modelId: route.modelId,
      preferred: route.preferred,
      candidates: models.filter((item) => item.available).length,
      neuronGuard: route.reason.includes(NEURON_GUARD_REASON),
      hop: !route.preferred,
    }),
    "auto mode routed turn",
  );
  return {
    providerId: route.providerId,
    modelId: route.modelId,
    model,
    autoTask: route.task,
    routeReason: route.reason,
  };
}

function applyLiteDownshift(
  route: NonNullable<ReturnType<typeof planAutoRoute>["route"]>,
  models: Awaited<ReturnType<typeof modelRegistry.listPublicModels>>,
  task: AutoTask,
): NonNullable<ReturnType<typeof planAutoRoute>["route"]> {
  if (task === "vision" || task === "files" || task === "image" || task === "tools") return route;
  const guarded = downshiftForNeurons({
    providerId: route.providerId,
    modelId: route.modelId,
    models,
    tier: classifyNeuronTier(task),
    pinned: false,
  });
  if (!guarded.downshifted) return route;
  logger.info(
    telemetry({
      event: "neuron_downshift",
      fromProvider: route.providerId,
      fromModel: route.modelId,
      toProvider: guarded.providerId,
      toModel: guarded.modelId,
      task,
      hop: true,
    }),
    "neuron guardrail downshifted auto route",
  );
  return {
    ...route,
    providerId: guarded.providerId,
    modelId: guarded.modelId,
    preferred: false,
    reason: `${route.reason}|${NEURON_GUARD_REASON}`,
  };
}

function imageProducer(file: { metadata?: unknown } | undefined): { providerId: string; modelId: string } | undefined {
  const meta = file?.metadata;
  const generatedBy =
    meta && typeof meta === "object" ? (meta as { generatedBy?: { providerId?: unknown; modelId?: unknown } }).generatedBy : undefined;
  return typeof generatedBy?.providerId === "string" && typeof generatedBy.modelId === "string"
    ? { providerId: generatedBy.providerId, modelId: generatedBy.modelId }
    : undefined;
}

function isImageOnlyTurn(modelId: string, autoTask?: AutoTask): boolean {
  return isCloudflareImageModel(modelId) || autoTask === "image";
}

function imageGenerationEmptyError(): AppError {
  return new AppError("Image generation did not produce a picture.", {
    statusCode: 502,
    code: "IMAGE_GENERATION_PROVIDER_ERROR",
    expose: true,
  });
}

/** What moved this turn off the requested model, for the SSE model event. */
function routeTrail(
  routed: { routedFrom?: string; routeReason?: string } | object,
  autoPlan: AutoResolution | undefined,
): Pick<PreparedTurn, "routedFrom" | "routeReason" | "autoTask"> {
  const trail = routed as { routedFrom?: string; routeReason?: string };
  if (trail.routedFrom) {
    return {
      routedFrom: trail.routedFrom,
      ...(trail.routeReason ? { routeReason: trail.routeReason } : {}),
      ...(autoPlan ? { autoTask: autoPlan.autoTask } : {}),
    };
  }
  if (autoPlan) {
    return { routedFrom: AUTO_MODEL_ID, routeReason: autoPlan.routeReason, autoTask: autoPlan.autoTask };
  }
  return {};
}

async function routeForAttachments(
  userId: string,
  requested: ResolvedModel,
  files: Array<{ mimeType: string }>,
): Promise<ResolvedModel & { routedFrom?: string; routeReason?: string }> {
  const need = attachmentNeed(files);
  if (need === "none") return requested;
  const models = await modelRegistry.listPublicModels(userId);
  const picked = pickAttachmentHop(models, requested, need, {
    blockedProviders: models.map((item) => item.providerId).filter((id) => isProviderBlocked(id)),
  });
  if (!picked) {
    if (need === "files") return requested;
    throw new AppError(
      "No configured model can read this image. Add a Gemini or OpenAI key, then send again.",
      { statusCode: 409, code: "ATTACHMENT_ROUTE_UNAVAILABLE", expose: true },
    );
  }
  if (!picked.rerouted) return requested;
  const model =
    models.find((item) => item.providerId === picked.providerId && item.id === picked.modelId) ??
    (await modelRegistry.assertModelAvailable(picked.providerId, picked.modelId, userId));
  logger.info(
    telemetry({
      event: "attachment_hop",
      fromProvider: requested.providerId,
      fromModel: requested.modelId,
      toProvider: picked.providerId,
      toModel: picked.modelId,
      need,
      hop: true,
    }),
    "attachment routed to a multimodal model",
  );
  return {
    providerId: picked.providerId,
    modelId: picked.modelId,
    model,
    routedFrom: requested.modelId,
    ...(picked.reason ? { routeReason: picked.reason } : {}),
  };
}

/**
 * Turn the picker's selection into the model that will actually run.
 *
 * Every caller reaches here only for a pinned selection — an Auto turn is
 * settled by routeAuto before this point — so there is no such thing as a
 * non-explicit choice here. A thread that stores `gemini-3.1-pro-preview`
 * stores it because the user picked it; inheriting that from the conversation
 * instead of re-sending it on every turn does not make it the server's to
 * swap. That distinction used to exist and is what answered a Pro selection
 * with Flash Lite from the second turn onward, while the header still read
 * Pro.
 */
async function resolveExecutionModel(userId: string, providerId: string, modelId: string): Promise<ResolvedModel> {
  const executionModelId =
    providerId === "groq"
      ? resolveGroqModelId(modelId)
      : providerId === "gemini"
        ? resolveGeminiModelId(modelId)
        : providerId === "deepseek"
          ? resolveDeepSeekModelId(modelId)
          : modelId;
  try {
    const model = await modelRegistry.assertModelAvailable(providerId, executionModelId, userId);
    return { providerId, modelId: executionModelId, model };
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "MODEL_UNAVAILABLE") throw error;
    // Refuse rather than substitute. Answering on a model the user did not
    // choose, while the header still shows theirs, is the mismatch this whole
    // path exists to prevent — and it is worse than an error that says which
    // model is gone and what to do about it.
    const models = await modelRegistry.listPublicModels(userId);
    const listed = models.find((item) => item.providerId === providerId && item.id === executionModelId)?.name;
    throw new AppError(
      `${describeSelectedModel(executionModelId, listed)} isn't available right now. Choose another model and send again.`,
      { statusCode: 400, code: "MODEL_UNAVAILABLE", expose: true },
    );
  }
}

function withToolMessages(
  systemMessages: ChatMessage[],
  imageGenerated: boolean,
): { toolSystemMessages?: ChatMessage[] } {
  const messages = [
    ...systemMessages,
    ...(imageGenerated
      ? [
          {
            role: "system" as const,
            content:
              "An image was generated from the user's request and is attached to your reply. Caption the picture in one short sentence. Do not introduce yourself, name Ken AI, or name the model. Do not say the user uploaded it.",
          },
        ]
      : []),
  ];
  return messages.length > 0 ? { toolSystemMessages: messages } : {};
}
