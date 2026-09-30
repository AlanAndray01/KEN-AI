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
    return "Server voice isn't turned on for this site yet. Your browser's built-in voice is used where it is available.";
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
