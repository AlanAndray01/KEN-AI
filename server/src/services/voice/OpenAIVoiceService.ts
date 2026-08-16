import { AppError } from "../../utils/AppError.js";
import type { SpeechResult, TranscriptionResult, VoiceService } from "./VoiceService.js";

export class OpenAIVoiceService implements VoiceService {
  readonly id = "openai";

  constructor(private readonly apiKey: string) {}

  sttConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  ttsConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  unavailableReason(): string {
    return "Voice is not configured. Set VOICE_API_KEY or OPENAI_API_KEY.";
  }

  async transcribe(input: { buffer: Buffer; mimeType: string; filename: string }): Promise<TranscriptionResult> {
    const form = new FormData();
    form.append("model", "whisper-1");
    form.append("file", new Blob([new Uint8Array(input.buffer)], { type: input.mimeType }), input.filename);
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!response.ok) {
      throw new AppError("Speech-to-text provider request failed", { statusCode: 502, code: "VOICE_PROVIDER_ERROR" });
    }
    const body = (await response.json()) as { text?: string };
    return { text: body.text?.trim() ?? "" };
  }

  async speak(text: string): Promise<SpeechResult> {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "alloy",
        input: text,
      }),
    });
    if (!response.ok) {
      throw new AppError("Text-to-speech provider request failed", { statusCode: 502, code: "VOICE_PROVIDER_ERROR" });
    }
    return {
      mimeType: response.headers.get("content-type") || "audio/mpeg",
      buffer: Buffer.from(await response.arrayBuffer()),
    };
  }
}
