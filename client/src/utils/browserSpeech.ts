type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export function getSpeechRecognition(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const host = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition;
}

export function canUseBrowserStt(): boolean {
  return Boolean(getSpeechRecognition());
}

export function canUseBrowserTts(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/**
 * Resolves once the browser has finished speaking, so a hands-free loop knows
 * when it is safe to listen again instead of transcribing its own voice.
 * Resolves false when this browser cannot speak at all.
 */
export function speakWithBrowser(text: string): Promise<boolean> {
  if (!canUseBrowserTts() || !text.trim()) return Promise.resolve(false);
  window.speechSynthesis.cancel();
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.onend = () => resolve(true);
    utterance.onerror = () => resolve(true);
    window.speechSynthesis.speak(utterance);
  });
}

/** Stops any in-flight browser speech. */
export function stopBrowserSpeech(): void {
  if (canUseBrowserTts()) window.speechSynthesis.cancel();
}
