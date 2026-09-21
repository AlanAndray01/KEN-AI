import type { PublicVoiceStatus } from "@Ken/shared";
import { authedFetch, failIfNotOk, request } from "./client";

export const voiceApi = {
  status: () => request<PublicVoiceStatus>("/voice/status"),
  transcribe: async (file: Blob) => {
    const body = new FormData();
    body.append("audio", file, "recording.webm");
    const response = await authedFetch("/voice/transcribe", {
      method: "POST",
      body,
    });
    await failIfNotOk(response);
    return (await response.json()) as { text: string };
  },
  speak: async (text: string) => {
    const response = await authedFetch("/voice/speak", {
      method: "POST",
      headers: { Accept: "audio/mpeg", "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    await failIfNotOk(response);
    return response.blob();
  },
};
