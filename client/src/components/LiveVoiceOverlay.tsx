import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, X } from "lucide-react";
import { getSpeechRecognition } from "@/utils/browserSpeech";
import { cn } from "@/utils/cn";

type Phase = "listening" | "thinking" | "speaking";

interface LiveVoiceOverlayProps {
  /** True while the reply to the spoken question is still streaming. */
  streaming: boolean;
  /** Id of the newest finished assistant turn, used to notice a new answer. */
  replyId?: string;
  replyText: string;
  /** False when neither the server nor the browser can produce audio. */
  canSpeak: boolean;
  onSend: (text: string) => void;
  onSpeak: (text: string) => Promise<void>;
  onClose: () => void;
}

const PHASE_LABEL: Record<Phase, string> = {
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

/**
 * Hands-free voice mode: listen, send what was heard as a normal chat turn,
 * read the reply out loud, then listen again.
 *
 * Recognition is the browser's own — the server's speech-to-text endpoint takes
 * a finished recording, which cannot drive a continuous loop, so the button
 * that opens this is disabled where `SpeechRecognition` is missing rather than
 * pretending to listen.
 *
 * The turn itself goes through the ordinary send path, so a spoken question is
 * saved, streamed, and rendered exactly like a typed one.
 */
export function LiveVoiceOverlay({
  streaming,
  replyId,
  replyText,
  canSpeak,
  onSend,
  onSpeak,
  onClose,
}: LiveVoiceOverlayProps) {
  const [phase, setPhase] = useState<Phase>("listening");
  const [heard, setHeard] = useState("");
  const [error, setError] = useState<string>();
  const [listenNonce, setListenNonce] = useState(0);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  // The reply already on screen when the session opened is not ours to read.
  const spokenReplyRef = useRef(replyId);
  const closedRef = useRef(false);
  // Held in refs so a parent re-render cannot restart recognition mid-sentence.
  const onSendRef = useRef(onSend);
  const onSpeakRef = useRef(onSpeak);
  onSendRef.current = onSend;
  onSpeakRef.current = onSpeak;

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.stop();
  }, []);

  useEffect(() => {
    if (phase !== "listening") return undefined;

    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setError("This browser cannot listen. Use the microphone button to dictate instead.");
      return undefined;
    }

    let transcript = "";
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      transcript = event.results[0]?.[0]?.transcript?.trim() ?? "";
      if (transcript) setHeard(transcript);
    };
    recognition.onerror = () => {
      transcript = "";
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (closedRef.current) return;
      if (transcript) {
        setPhase("thinking");
        onSendRef.current(transcript);
        return;
      }
      // Recognition stops itself after a pause. Nothing was said, so open a new
      // window rather than leaving the session deaf.
      setListenNonce((value) => value + 1);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // Already running from a previous mount in development's double effect.
    }

    return () => {
      recognitionRef.current = null;
      recognition.onend = null;
      recognition.onresult = null;
      recognition.stop();
    };
  }, [phase, listenNonce]);

  useEffect(() => {
    if (phase !== "thinking" || streaming) return undefined;
    if (!replyId || replyId === spokenReplyRef.current) return undefined;

    spokenReplyRef.current = replyId;
    setPhase("speaking");

    let cancelled = false;
    void (async () => {
      if (canSpeak && replyText) await onSpeakRef.current(replyText);
      if (!cancelled && !closedRef.current) {
        setHeard("");
        setPhase("listening");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, streaming, replyId, replyText, canSpeak]);

  // A send that never started — no model configured, say — would otherwise
  // leave the session waiting on a reply that is not coming.
  useEffect(() => {
    if (phase !== "thinking" || streaming) return undefined;
    const id = window.setTimeout(() => {
      if (!closedRef.current) setPhase("listening");
    }, 2500);
    return () => window.clearTimeout(id);
  }, [phase, streaming]);

  const close = useCallback(() => {
    closedRef.current = true;
    stopListening();
    onClose();
  }, [onClose, stopListening]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Live voice chat"
      className="live-voice-overlay fixed inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-canvas/95 px-6"
    >
      <div className="relative flex size-40 items-center justify-center">
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 rounded-full border border-accent/40",
            phase === "listening" && "animate-ping",
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-4 rounded-full bg-accent/10 transition-transform duration-500",
            phase === "speaking" && "scale-110 bg-accent/20",
          )}
        />
        <Mic className="relative size-10 text-accent" aria-hidden="true" />
      </div>

      <div className="flex max-w-xl flex-col items-center gap-3 text-center">
        <p className="font-mono text-xs tracking-[0.28em] text-accent uppercase" aria-live="polite">
          {PHASE_LABEL[phase]}
        </p>
        <p className="min-h-6 text-lg text-fg">{heard || "Say something to KEN."}</p>
        {phase === "speaking" && !canSpeak ? (
          <p className="text-sm text-fg-muted">{replyText}</p>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {!canSpeak && !error ? (
          <p className="text-sm text-fg-muted">
            Replies are shown as text: no speech output is configured.
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={close}
        className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm text-fg hover:bg-surface-muted"
      >
        <X className="size-4" aria-hidden="true" />
        End live chat
      </button>
    </div>
  );
}
