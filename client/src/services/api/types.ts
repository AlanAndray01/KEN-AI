import type { PublicConversation, PublicMessage, PublicUser } from "@Ken/shared";

export interface AuthResponse {
  user: PublicUser;
}

export interface VerificationRequiredResponse {
  success?: true;
  message?: string;
  requiresVerification: true;
  email: string;
  emailSent: boolean;
  verificationCode?: string;
}

export interface OkResponse {
  ok: true;
  resetToken?: string;
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
  autoTask?: PublicMessage["autoTask"];
  model?: string;
  provider?: string;
}
