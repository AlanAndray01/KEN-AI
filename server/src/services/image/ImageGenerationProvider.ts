export interface ImageGenerationRequest {
  prompt: string;
  userId: string;
  abortSignal?: AbortSignal;
  providerId?: string;
  /** A specific model on the pinned backend (e.g. one of several Cloudflare image models). */
  modelId?: string;
}

export interface GeneratedImage {
  mimeType: string;
  buffer: Buffer;
  prompt: string;
  providerId?: string;
  modelId?: string;
}

export function imageRequestSignal(request: ImageGenerationRequest): AbortSignal {
  const deadline = AbortSignal.timeout(90_000);
  return request.abortSignal ? AbortSignal.any([request.abortSignal, deadline]) : deadline;
}

export interface ImageGenerationProvider {
  readonly id: string;
  isConfigured(): boolean;
  unavailableReason(): string;
  generate(request: ImageGenerationRequest): Promise<GeneratedImage>;
}
