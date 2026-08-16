export interface TranscriptionResult {
  text: string;
}

export interface SpeechResult {
  mimeType: string;
  buffer: Buffer;
}

export interface VoiceService {
  readonly id: string;
  sttConfigured(): boolean;
  ttsConfigured(): boolean;
  unavailableReason(): string;
  transcribe(input: { buffer: Buffer; mimeType: string; filename: string }): Promise<TranscriptionResult>;
  speak(text: string): Promise<SpeechResult>;
}
