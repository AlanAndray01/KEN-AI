import { useRef, useState } from "react";
import { api, ApiError } from "@/services/api";
import { toast } from "@/stores/toastStore";
import { getSpeechRecognition, speakWithBrowser, stopBrowserSpeech } from "@/utils/browserSpeech";

export function useChatVoice(options: {
  sttConfigured: boolean;
  ttsConfigured: boolean;
  voiceDisabledReason?: string;
  onTranscript: (text: string) => void;
}): {
  recording: boolean;
  liveVoiceOpen: boolean;
  setLiveVoiceOpen: (open: boolean) => void;
  onVoiceInput: () => Promise<void>;
  onSpeak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
} {
  const { sttConfigured, ttsConfigured, voiceDisabledReason, onTranscript } = options;
  const [recording, setRecording] = useState(false);
  const [liveVoiceOpen, setLiveVoiceOpen] = useState(false);
  const speakingAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);

  async function onVoiceInput(): Promise<void> {
    if (recording) {
      mediaRecorderRef.current?.stop();
      recognitionRef.current?.stop();
      return;
    }
    if (sttConfigured) {
      await startServerVoice();
      return;
    }
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      toast(voiceDisabledReason ?? "Voice input is not configured.", "error");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) onTranscript(transcript);
    };
    recognition.onerror = () => {
      setRecording(false);
      toast("Unable to capture speech in this browser.", "error");
    };
    recognition.onend = () => {
      setRecording(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }

  async function startServerVoice(): Promise<void> {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast("Voice recording is not supported in this browser.", "error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaChunksRef.current = [];
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) mediaChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        mediaRecorderRef.current = null;
        void (async () => {
          try {
            const result = await api.voice.transcribe(blob);
            if (result.text) onTranscript(result.text);
          } catch (err) {
            toast(err instanceof ApiError ? err.message : "Voice input is not configured.", "error");
          }
        })();
      };
      recorder.start();
      setRecording(true);
    } catch {
      toast("Unable to access the microphone.", "error");
    }
  }

  /** Resolves when playback finishes, so the live voice loop can resume listening. */
  async function onSpeak(text: string): Promise<void> {
    if (!text.trim()) return;
    if (ttsConfigured) {
      try {
        const blob = await api.voice.speak(text);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        speakingAudioRef.current = audio;
        await audio.play();
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
        });
        URL.revokeObjectURL(url);
        speakingAudioRef.current = null;
        return;
      } catch (err) {
        if (await speakWithBrowser(text)) return;
        toast(err instanceof ApiError ? err.message : "Voice playback is not configured.", "error");
        return;
      }
    }
    if (!(await speakWithBrowser(text))) {
      toast("Voice playback is not configured.", "error");
    }
  }

  /** Cuts playback short when the reader closes live voice mid-sentence. */
  function stopSpeaking(): void {
    const audio = speakingAudioRef.current;
    if (audio) {
      audio.pause();
      speakingAudioRef.current = null;
    }
    stopBrowserSpeech();
  }

  return {
    recording,
    liveVoiceOpen,
    setLiveVoiceOpen,
    onVoiceInput,
    onSpeak,
    stopSpeaking,
  };
}
