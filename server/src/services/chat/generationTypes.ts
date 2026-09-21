import type { PublicConversation, PublicMessage } from "@Ken/shared";
import type { AutoTask } from "@Ken/shared";
import type { ChatMessage } from "../ai/AIProvider.js";
import type { NeuronTier } from "./neuronGuardrail.js";

export interface PreparedGeneration {
  userId: string;
  conversationId: string;
  generationId: string;
  providerId: string;
  modelId: string;
  modelName: string;
  userMessage: PublicMessage;
  assistantMessage: PublicMessage;
  conversation: PublicConversation;
  abortSignal: AbortSignal;
  contextWindow?: number;
  toolSystemMessages?: ChatMessage[];
  customGptId?: string;
  routedFrom?: string;
  routeReason?: string;
  /** Set when Auto picked the model for this turn. */
  autoTask?: AutoTask;
  neuronTier: NeuronTier;
  /** Flux (or another image tool) already produced a picture on this turn. */
  imageGenerated?: boolean;
  /** Stored file ids Flux produced; the caption model sees them, the UI does not put them on the user. */
  generatedFileIds?: string[];
  /** Pinned Flux or Auto image: the JPEG is the reply; no chat stream. */
  imageOnly?: boolean;
}

export interface ChatStreamEvent {
  type: "start" | "chunk" | "complete" | "aborted" | "error" | "timing" | "model" | "estimate";
  conversation?: PublicConversation;
  userMessage?: PublicMessage;
  assistantMessage?: PublicMessage;
  generationId?: string;
  text?: string;
  message?: string;
  code?: string;
  requestId?: string;
  requestedModel?: string;
  activeModel?: string;
  fallbackFrom?: string;
  fallbackReason?: string;
  ttfbMs?: number;
  googleConnectMs?: number;
  firstVisibleChunkMs?: number;
  completeMs?: number;
  /** Median duration of comparable past runs on this model. Absent until enough history exists. */
  estimatedMs?: number;
  /** Sample count behind `estimatedMs`, so the UI can hedge a thin estimate. */
  estimateSamples?: number;
  /** False when a deep-code turn had to borrow general-mode samples. */
  estimateMatchedMode?: boolean;
  /** This turn asked for a substantial code artifact. */
  deepCode?: boolean;
  /** Set when Auto picked the model, naming what it routed for. */
  autoTask?: AutoTask;
  model?: string;
  modelName?: string;
  provider?: string;
}

export interface GenerationRuntime {
  requestId?: string;
  startedAt?: number;
}
