export interface ImageGenerationRequest {
  prompt: string;
  userId: string;
}

export interface GeneratedImage {
  mimeType: string;
  buffer: Buffer;
  prompt: string;
}

export interface ImageGenerationProvider {
  readonly id: string;
  isConfigured(): boolean;
  unavailableReason(): string;
  generate(request: ImageGenerationRequest): Promise<GeneratedImage>;
}
