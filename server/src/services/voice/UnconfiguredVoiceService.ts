import { AppError } from "../../utils/AppError.js";
import type { SpeechResult, TranscriptionResult, VoiceService } from "./VoiceService.js";

export class UnconfiguredVoiceService implements VoiceService {
  readonly id = "none";

  sttConfigured(): boolean {
    return false;
  }

  ttsConfigured(): boolean {
    return false;
  }

  unavailableReason(): string {
    return "Voice is not configured. Set VOICE_PROVIDER=openai and VOICE_API_KEY or OPENAI_API_KEY. Realtime voice is not enabled.";
  }

  async transcribe(): Promise<TranscriptionResult> {
    throw new AppError(this.unavailableReason(), {
      statusCode: 503,
      code: "VOICE_NOT_CONFIGURED",
      expose: true,
    });
  }

  async speak(): Promise<SpeechResult> {
    throw new AppError(this.unavailableReason(), {
      statusCode: 503,
      code: "VOICE_NOT_CONFIGURED",
      expose: true,
    });
  }
}
