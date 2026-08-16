import { env } from "../../config/env.js";
import { OpenAIVoiceService } from "./OpenAIVoiceService.js";
import { UnconfiguredVoiceService } from "./UnconfiguredVoiceService.js";
import type { VoiceService } from "./VoiceService.js";

export function createVoiceService(): VoiceService {
  const key = env.VOICE_API_KEY ?? env.OPENAI_API_KEY;
  if (env.VOICE_PROVIDER === "openai" && key) {
    return new OpenAIVoiceService(key);
  }
  return new UnconfiguredVoiceService();
}

export const voiceService: VoiceService = createVoiceService();
