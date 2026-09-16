import type { ModelCapability, PublicAIModel } from "@Ken/shared";
import {
  CLOUDFLARE_VISION_MODEL_ID,
  DEFAULT_GEMINI_MODEL_ID,
  DEFAULT_OPENAI_MODEL_ID,
} from "@Ken/shared";
import type { ChatMessage } from "./AIProvider.js";
import { GEMINI_PRIMARY_MODEL_IDS } from "./primaryModel.js";

export type AttachmentNeed = "none" | "vision" | "files";

export const ATTACHMENT_ROUTE_REASON = "ATTACHMENT_ROUTE";

export function attachmentNeed(files: Array<{ mimeType: string }>): AttachmentNeed {
  let need: AttachmentNeed = "none";
  for (const file of files) {
    if (file.mimeType === "application/pdf") {
      return "files";
    }
    if (file.mimeType.startsWith("image/") && need === "none") {
      need = "vision";
    }
  }
  return need;
}

export function attachmentNeedFromMessages(messages: ChatMessage[]): AttachmentNeed {
  return attachmentNeed(messages.flatMap((message) => message.parts ?? []));
}

export function modelSatisfiesAttachmentNeed(
  capabilities: readonly ModelCapability[] | undefined,
  need: AttachmentNeed,
): boolean {
  if (need === "none") return true;
  if (!capabilities) return false;
  if (need === "vision") return capabilities.includes("vision");
  return capabilities.includes("files");
}

export interface AttachmentRoute {
  providerId: string;
  modelId: string;
  rerouted: boolean;
  reason?: string;
}

const PROVIDER_PREFERENCE = ["gemini", "openai", "cloudflare"] as const;

/**
 * Pick a configured model that can actually receive the attachment.
 * Prefer the user's selection, then Gemini, then other vision/file models.
 */
export function pickMultimodalRoute(
  models: Array<Pick<PublicAIModel, "id" | "providerId" | "capabilities" | "available" | "enabled">>,
  requested: { providerId: string; modelId: string },
  need: AttachmentNeed,
): AttachmentRoute | undefined {
  const available = models.filter((model) => model.enabled !== false && model.available !== false);
  if (need === "none") {
    return { providerId: requested.providerId, modelId: requested.modelId, rerouted: false };
  }

  const current = available.find(
    (model) => model.providerId === requested.providerId && model.id === requested.modelId,
  );
  if (current && modelSatisfiesAttachmentNeed(current.capabilities, need)) {
    return { providerId: current.providerId, modelId: current.id, rerouted: false };
  }

  const preferredIds = (providerId: string): readonly string[] => {
    if (providerId === "gemini") return GEMINI_PRIMARY_MODEL_IDS;
    if (providerId === "openai") return [DEFAULT_OPENAI_MODEL_ID, "gpt-4.1"];
    if (providerId === "cloudflare") return [CLOUDFLARE_VISION_MODEL_ID];
    return [];
  };

  const tryProvider = (providerId: string): AttachmentRoute | undefined => {
    const pool = available.filter(
      (model) => model.providerId === providerId && modelSatisfiesAttachmentNeed(model.capabilities, need),
    );
    if (pool.length === 0) return undefined;
    const preferred = preferredIds(providerId);
    const match =
      (providerId === "gemini" ? pool.find((model) => model.id === DEFAULT_GEMINI_MODEL_ID) : undefined) ??
      preferred.map((id) => pool.find((model) => model.id === id)).find(Boolean) ??
      pool[0];
    if (!match) return undefined;
    return {
      providerId: match.providerId,
      modelId: match.id,
      rerouted: match.providerId !== requested.providerId || match.id !== requested.modelId,
      reason: `${ATTACHMENT_ROUTE_REASON}|${need}`,
    };
  };

  const sameProvider = tryProvider(requested.providerId);
  if (sameProvider?.rerouted) return sameProvider;

  for (const providerId of PROVIDER_PREFERENCE) {
    if (providerId === requested.providerId) continue;
    const hop = tryProvider(providerId);
    if (hop) return hop;
  }

  return sameProvider;
}
