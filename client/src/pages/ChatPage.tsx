import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Menu } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AUTO_MODEL_ID,
  AUTO_PROVIDER_ID,
  GEMINI_FLASH_MODEL_ID,
  isAutoSelection,
  type PublicConversation,
  type PublicFile,
  type PublicMessage,
  type PublicMessageFeedback,
} from "@Ken/shared";
import { ChatComposer } from "@/components/ChatComposer";
import { ChatTurn } from "@/components/ChatTurn";
import type { GenerationEstimate } from "@/components/CodeGenerationTicker";
import { ModelSelector } from "@/components/ModelSelector";
import { ShareExportMenu } from "@/components/ShareExportMenu";
import { useAuth } from "@/hooks/useAuth";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import { useStreamBuffer } from "@/hooks/useStreamBuffer";
import { CONVERSATION_STALE_MS, MESSAGE_STALE_MS, QUERY_STALE_MS } from "@/query";
import { ApiError, api } from "@/services/api";
import { draftKey, useDraftStore } from "@/stores/draftStore";
import { useModelStore } from "@/stores/modelStore";
import { toast } from "@/stores/toastStore";
import { useUiStore } from "@/stores/uiStore";
import { attachmentRejection } from "@/utils/attachmentGate";
import { describeApiError, logApiError } from "@/utils/apiErrors";
import {
  canUseBrowserStt,
  canUseBrowserTts,
  getSpeechRecognition,
  speakWithBrowser,
  stopBrowserSpeech,
} from "@/utils/browserSpeech";
import { appendChunk, applyAssistantModel, applyFeedback, CHAT_MESSAGE_WINDOW, markLastAssistant, optimisticTurn, startTurn, truncateFromMessage, upsertMessage } from "@/utils/chatMessages";
import { availableCapabilities, captionProps } from "@/utils/autoMode";
import { pickDefaultModel, shouldReplaceStoredModel } from "@/utils/defaultModel";
import type { MentionCandidate } from "@/utils/mentions";

/** Server clamps to 200. Only CHAT_MESSAGE_WINDOW of these are mounted at once. */
const HISTORY_FETCH_LIMIT = 200;

const AddModelKeysDialog = lazy(() =>
  import("@/components/AddModelKeysDialog").then((mod) => ({ default: mod.AddModelKeysDialog })),
);
const LiveVoiceOverlay = lazy(() =>
  import("@/components/LiveVoiceOverlay").then((mod) => ({ default: mod.LiveVoiceOverlay })),
);

export function ChatPage() {
  const { conversationId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const setMobileOpen = useUiStore((state) => state.setMobileOpen);
  const keysPanelOpen = useUiStore((state) => state.keysPanelOpen);
  const setKeysPanelOpen = useUiStore((state) => state.setKeysPanelOpen);
  const storedProviderId = useModelStore((state) => state.providerId);
  const storedModelId = useModelStore((state) => state.modelId);
  const setSelection = useModelStore((state) => state.setSelection);
  const restoreDefault = useModelStore((state) => state.restoreDefault);
  const persistDraft = useDraftStore((state) => state.setDraft);
  const clearStoredDraft = useDraftStore((state) => state.clearDraft);
  const currentDraftKey = draftKey(conversationId);
  const [draft, setDraft] = useState(() => useDraftStore.getState().drafts[currentDraftKey] ?? "");
  const [streaming, setStreaming] = useState(false);
  const [generationId, setGenerationId] = useState<string>();
  const [liveMessages, setLiveMessages] = useState<PublicMessage[] | null>(null);
  const [attachments, setAttachments] = useState<PublicFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [recording, setRecording] = useState(false);
  const [liveVoiceOpen, setLiveVoiceOpen] = useState(false);
  const [mentionedGpt, setMentionedGpt] = useState<MentionCandidate>();
  /** True while the streaming turn was classified as a deep code request. */
  const [deepCodeTurn, setDeepCodeTurn] = useState(false);
  /** Server-measured duration estimate, absent until its event arrives. */
  const [generationEstimate, setGenerationEstimate] = useState<GenerationEstimate>();
  const speakingAudioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamConversationRef = useRef<string | undefined>(undefined);
  const appliedConversationRef = useRef<string | undefined>(undefined);
  const userPickedModelRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const messagesRef = useRef<PublicMessage[]>([]);
  // `pinned` is no longer read here: the jump-to-latest button that used it was
  // removed. The hook still tracks it internally to decide whether new tokens
  // should scroll the view.
  const { containerRef: scrollRef, stickToBottom, pin } = useStickToBottom<HTMLElement>();
  const [showAllMessages, setShowAllMessages] = useState(false);

  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.conversations.list(),
    staleTime: CONVERSATION_STALE_MS,
  });
  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: () => api.models.list(),
    staleTime: QUERY_STALE_MS,
  });
  const messagesQuery = useQuery({
    queryKey: ["messages", conversationId],
    // The server defaults to 50, which silently truncated long threads: the
    // "Show earlier messages" control could only ever reveal what was fetched.
    queryFn: () => api.conversations.messages(conversationId ?? "", { limit: HISTORY_FETCH_LIMIT }),
    enabled: Boolean(conversationId),
    staleTime: MESSAGE_STALE_MS,
  });

  const models = useMemo(() => modelsQuery.data?.models ?? [], [modelsQuery.data?.models]);
  const defaultModel = useMemo(() => pickDefaultModel(models), [models]);
  const conversations = conversationsQuery.data?.conversations ?? [];
  const currentConversation = conversations.find((conversation) => conversation.id === conversationId);

  const providerId = storedProviderId || AUTO_PROVIDER_ID;
  const modelId = storedModelId || AUTO_MODEL_ID;
  const autoMode = isAutoSelection(providerId, modelId);
  const selectedModel = autoMode
    ? undefined
    : (models.find((model) => model.providerId === providerId && model.id === modelId) ?? defaultModel);
  // In Auto the server picks per turn and sends an attachment to a model that
  // can read it, so the composer offers what any available model can do.
  const capabilities = autoMode ? availableCapabilities(models) : (selectedModel?.capabilities ?? []);

  const toolsQuery = useQuery({
    // Auto has no single model to gate tools by; the capability union above
    // covers the picker, and the router sends a tool turn to a tool-capable model.
    queryKey: ["tools", providerId, modelId],
    queryFn: () => (autoMode ? api.tools.list() : api.tools.list(providerId, modelId)),
    staleTime: QUERY_STALE_MS,
  });
  const voiceQuery = useQuery({
    queryKey: ["voice-status"],
    queryFn: () => api.voice.status(),
    staleTime: QUERY_STALE_MS,
  });
  const gptsQuery = useQuery({
    queryKey: ["gpts", "usable"],
    queryFn: () => api.gpts.list({ scope: "usable" }),
    staleTime: QUERY_STALE_MS,
  });

  const searchTool = toolsQuery.data?.tools.find((tool) => tool.id === "web_search");
  const imageTool = toolsQuery.data?.tools.find((tool) => tool.id === "image_generation");
  const modelCanTools = capabilities.includes("tools") || capabilities.includes("webSearch");
  const webSearchDisabledReason = !searchTool?.configured
    ? (searchTool?.unavailableReason ?? "Web search is not configured.")
    : !modelCanTools
      ? "This model cannot use tools."
      : undefined;
  const imageDisabledReason = imageTool?.configured
    ? undefined
    : (imageTool?.unavailableReason ?? "Image generation is not configured.");
  const voiceDisabledReason = voiceQuery.data?.sttConfigured || canUseBrowserStt()
    ? undefined
    : (voiceQuery.data?.message ?? "Voice input is not configured.");
  const ttsConfigured = Boolean(voiceQuery.data?.ttsConfigured) || canUseBrowserTts();
  const ttsUnavailableReason =
    voiceQuery.data?.message ?? "Text-to-speech is not configured, and this browser cannot speak.";
  // A hands-free loop needs recognition that runs continuously. The server's
  // transcribe endpoint takes one finished recording, so live mode is offered
  // only where the browser can listen.
  const liveVoiceDisabledReason = canUseBrowserStt()
    ? undefined
    : "Live voice needs speech recognition, which this browser does not provide.";
  const gptParam = searchParams.get("gpt");
  const activeGptId = mentionedGpt?.id ?? currentConversation?.customGptId ?? gptParam ?? undefined;
  const gptQuery = useQuery({
    queryKey: ["gpts", activeGptId],
    queryFn: () => api.gpts.get(activeGptId ?? ""),
    enabled: Boolean(activeGptId),
    staleTime: QUERY_STALE_MS,
  });
  const activeGpt = gptQuery.data?.gpt;
  const mentionCandidates = (gptsQuery.data?.gpts ?? []).map((gpt) => ({
    id: gpt.id,
    name: gpt.name,
    ...(gpt.description ? { description: gpt.description } : {}),
  }));

  useEffect(() => {
    // Deferred to idle time rather than fired on mount: this chunk (remark/
    // rehype/KaTeX) is large, and a fresh /chat visit paints its LCP element
    // (the empty-state prompt) as plain text that needs none of it. Loading
    // it eagerly puts it on the main thread exactly when LCP is trying to
    // happen, which is what Lighthouse's mobile run (4x CPU throttling)
    // flagged as the biggest contributor to a 4.5s LCP. Idle-loading still
    // has it warm well before the first reply streams back.
    const loadMarkdown = () => void import("@/components/MarkdownContent");
    if ("requestIdleCallback" in window) {
      const idleHandle = window.requestIdleCallback(loadMarkdown, { timeout: 2000 });
      return () => window.cancelIdleCallback(idleHandle);
    }
    const timeoutHandle = globalThis.setTimeout(loadMarkdown, 300);
    return () => globalThis.clearTimeout(timeoutHandle);
  }, []);

  useEffect(() => {
    setDraft(useDraftStore.getState().drafts[draftKey(conversationId)] ?? "");
  }, [conversationId]);

  useEffect(() => {
    const handle = window.setTimeout(() => persistDraft(currentDraftKey, draft), 250);
    return () => window.clearTimeout(handle);
  }, [currentDraftKey, draft, persistDraft]);

  useEffect(() => {
    if (!gptParam) return;
    void api.gpts
      .get(gptParam)
      .then(({ gpt }) => {
        setMentionedGpt({
          id: gpt.id,
          name: gpt.name,
          ...(gpt.description ? { description: gpt.description } : {}),
        });
        if (gpt.providerId && gpt.modelId) {
          userPickedModelRef.current = true;
          setSelection(gpt.providerId, gpt.modelId);
        }
        setSearchParams({}, { replace: true });
      })
      .catch(() => toast("GPT not found", "error"));
  }, [gptParam, setSearchParams, setSelection]);

  useEffect(() => {
    if (currentConversation) return;
    if (!defaultModel || models.length === 0) return;
    // Auto is a valid selection, not a gap to fill with a fixed model.
    if (autoMode) return;
    const leftoverPreviousDefault = providerId === "gemini" && modelId === GEMINI_FLASH_MODEL_ID;
    if (!shouldReplaceStoredModel({ providerId, modelId }, defaultModel, models) && !leftoverPreviousDefault) {
      return;
    }
    // Keep an explicit picker change (including 3.8) for this new thread.
    if (userPickedModelRef.current) return;
    // A stale or retired pick returns to Auto rather than to another fixed
    // model, so the router decides until the user says otherwise.
    setSelection(AUTO_PROVIDER_ID, AUTO_MODEL_ID);
  }, [autoMode, currentConversation, defaultModel, modelId, models, providerId, setSelection]);

  useEffect(() => {
    if (!currentConversation) {
      appliedConversationRef.current = undefined;
      // Leaving a thread returns the picker to the saved default instead of
      // inheriting whichever model the last thread happened to use.
      restoreDefault();
      return;
    }
    if (appliedConversationRef.current === currentConversation.id) return;
    appliedConversationRef.current = currentConversation.id;
    userPickedModelRef.current = false;
    if (
      defaultModel &&
      shouldReplaceStoredModel(
        { providerId: currentConversation.providerId, modelId: currentConversation.modelId },
        defaultModel,
        models,
      )
    ) {
      setSelection(AUTO_PROVIDER_ID, AUTO_MODEL_ID, { persist: false });
      return;
    }
    // Mirroring a thread's model must not overwrite the saved default.
    setSelection(currentConversation.providerId, currentConversation.modelId, { persist: false });
  }, [currentConversation, defaultModel, models, restoreDefault, setSelection]);

  useEffect(() => {
    if (streamConversationRef.current === conversationId) return;
    setLiveMessages(null);
  }, [conversationId]);

  const messages = useMemo(
    () => liveMessages ?? messagesQuery.data?.messages ?? [],
    [liveMessages, messagesQuery.data?.messages],
  );
  messagesRef.current = messages;
  const waitingForMessages =
    Boolean(conversationId) && messagesQuery.isPending && liveMessages === null;
  const skeletonCount = Math.min(4, Math.max(2, currentConversation?.messageCount || 2));

  // Not wrapped in startTransition: React is free to defer a transition when
  // other work arrives, and a deferred token batch is exactly the stutter this
  // stream is meant to avoid. useStreamBuffer already caps the work at one
  // update per frame, so these stay urgent.
  const { push: pushChunk, flush: flushChunks, reset: resetChunks } = useStreamBuffer((text) => {
    setLiveMessages((current) => appendChunk(current ?? messagesRef.current, text));
  });

  useEffect(() => {
    resetChunks();
    setShowAllMessages(false);
  }, [conversationId, resetChunks]);

  // Slice rather than react-window: turns have variable height (markdown,
  // KaTeX, streaming caret) so a fixed-size virtualizer would jump the scroll
  // position. 32 mounted nodes is the budget; older ones stay as plain text
  // until they scroll near the viewport.
  const hiddenCount =
    showAllMessages || messages.length <= CHAT_MESSAGE_WINDOW ? 0 : messages.length - CHAT_MESSAGE_WINDOW;
  const visibleMessages = hiddenCount > 0 ? messages.slice(-CHAT_MESSAGE_WINDOW) : messages;
  // The newest finished answer, which live voice mode reads out loud.
  const latestReply = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === "assistant" && message.status !== "streaming"),
    [messages],
  );

  // Follow the newest tokens only while the reader is already at the bottom, so
  // scrolling up mid-stream to re-read something is not yanked back every frame.
  useEffect(() => {
    stickToBottom();
  }, [messages, stickToBottom]);

  // A new conversation always starts pinned to its latest turn.
  useEffect(() => {
    pin();
  }, [conversationId, pin]);

  function applyThreadSelection(nextProvider: string, nextModel: string): void {
    userPickedModelRef.current = true;
    setSelection(nextProvider, nextModel);
    if (!conversationId) return;
    queryClient.setQueryData<{ conversations: PublicConversation[] }>(["conversations"], (cached) => {
      if (!cached) return cached;
      return {
        conversations: cached.conversations.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, providerId: nextProvider, modelId: nextModel }
            : conversation,
        ),
      };
    });
    void api.conversations.update(conversationId, { providerId: nextProvider, modelId: nextModel }).catch(() => {
      // Local selection still applies; the next send carries the same ids.
    });
  }

  async function consumeStream(
    iterator: AsyncGenerator<{
      type: string;
      conversation?: PublicConversation;
      userMessage?: PublicMessage;
      assistantMessage?: PublicMessage;
      generationId?: string;
      text?: string;
      message?: string;
      model?: string;
      provider?: string;
      activeModel?: string;
      fallbackFrom?: string;
      fallbackReason?: string;
      modelName?: string;
      deepCode?: boolean;
      estimatedMs?: number;
      estimateSamples?: number;
      estimateMatchedMode?: boolean;
      autoTask?: PublicMessage["autoTask"];
    }>,
  ): Promise<void> {
    setStreaming(true);
    setDeepCodeTurn(false);
    setGenerationEstimate(undefined);
    try {
      for await (const event of iterator) {
        if (event.type === "estimate" && event.estimatedMs !== undefined) {
          setGenerationEstimate({
            estimatedMs: event.estimatedMs,
            samples: event.estimateSamples ?? 0,
            matchedMode: event.estimateMatchedMode === true,
          });
        }
        if (event.type === "start") {
          setDeepCodeTurn(event.deepCode === true);
          if (event.generationId) setGenerationId(event.generationId);
          if (event.conversation) {
            streamConversationRef.current = event.conversation.id;
            if (event.conversation.id !== conversationId) {
              void navigate(`/chat/${event.conversation.id}`);
            }
          }
          setLiveMessages((current) => {
            const sameConversation = !conversationId || event.conversation?.id === conversationId;
            // Read the thread as it stands at this instant. onEditMessage and
            // onRegenerate trim it synchronously before opening the stream, and
            // the render closure that created this handler still holds the
            // pre-trim messagesQuery.data — using it would resurrect the branch
            // the edit was meant to discard.
            const base = sameConversation
              ? (current ??
                queryClient.getQueryData<{ messages: PublicMessage[] }>(["messages", conversationId])?.messages ??
                [])
              : [];
            // The server stamps the model that is actually executing, so it is
            // shown as sent. Overwriting it with the picker selection is what
            // used to hide a quota fallback behind the model the user chose.
            return startTurn(base, event.userMessage, event.assistantMessage);
          });
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
        if (event.type === "model" && (event.model || event.assistantMessage?.model)) {
          const model = event.model ?? event.assistantMessage?.model;
          const provider = event.provider ?? event.assistantMessage?.provider;
          if (!model) continue;
          // A routing change is never announced. Auto picking per turn, a
          // cooldown hop, a quota failover mid-stream — all of it is routine
          // and none of it interrupts the reader. The reply's own footer is
          // where a model change surfaces, and it always names whichever model
          // actually produced the text above it, so nothing is hidden by the
          // silence: the attribution is on the message it belongs to rather
          // than in a notice that outlives the turn it described.
          setLiveMessages((current) =>
            applyAssistantModel(current ?? messages, {
              model,
              ...(provider ? { provider } : {}),
              ...(event.assistantMessage?.id ? { messageId: event.assistantMessage.id } : {}),
              ...(event.autoTask ? { autoTask: event.autoTask } : {}),
            }),
          );
          // An attachment route is the one hop that also moves the thread, so
          // the next message keeps going to the model that can read the file.
          // That is a selection change, not a notification.
          const routedForAttachment =
            Boolean(event.fallbackFrom) && String(event.fallbackReason ?? "").startsWith("ATTACHMENT_ROUTE");
          if (routedForAttachment && provider) {
            applyThreadSelection(provider, model);
          }
        }
        if (event.type === "chunk" && event.text) {
          pushChunk(event.text);
        }
        if (event.type === "complete" || event.type === "aborted" || event.type === "error") {
          flushChunks();
          if (event.assistantMessage) {
            const finished = event.assistantMessage;
            setLiveMessages((current) => upsertMessage(current ?? messages, finished));
          } else if (event.type === "error") {
            setLiveMessages((current) => markLastAssistant(current ?? messages, "error"));
          } else if (event.type === "aborted") {
            setLiveMessages((current) => markLastAssistant(current ?? messages, "aborted"));
          }
          if (event.type === "error") {
            toast(event.message ?? "Generation failed", "error");
          }
          if (event.type === "aborted") {
            toast("Generation stopped", "info");
          }
        }
      }
    } catch (err) {
      flushChunks();
      if ((err as { name?: string }).name === "AbortError") {
        if (abortRef.current?.signal.aborted) return;
        setLiveMessages((current) => markLastAssistant(current ?? messages, "error"));
        toast("The model took too long to respond.", "error");
        return;
      }
      setLiveMessages((current) => markLastAssistant(current ?? messages, "error"));
      logApiError("chat.send", err);
      toast(describeApiError(err, "Unable to send message"), "error");
    } finally {
      setStreaming(false);
      setDeepCodeTurn(false);
      setGenerationEstimate(undefined);
      setGenerationId(undefined);
      abortRef.current = null;
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      const activeId = streamConversationRef.current ?? conversationId;
      if (activeId) {
        await queryClient.invalidateQueries({ queryKey: ["messages", activeId] });
      }
    }
  }

  /**
   * Sends the draft, or `spoken` when live voice mode supplies the turn. A
   * spoken turn carries no attachments and leaves the typed draft alone, so
   * switching to voice never eats something half-written.
   */
  async function onSubmit(spoken?: string): Promise<void> {
    const content = (spoken ?? draft).trim();
    const outgoing = spoken === undefined ? attachments : [];
    if ((!content && outgoing.length === 0) || streaming || uploading) return;
    if (modelsQuery.isPending) {
      toast("Models are still loading. Try again in a moment.", "error");
      return;
    }
    if (modelsQuery.isError) {
      toast(describeApiError(modelsQuery.error, "Unable to load models"), "error");
      return;
    }
    if (!defaultModel && models.length === 0) {
      toast("No AI provider configured. Check GEMINI_API_KEY on the API and restart it.", "error");
      return;
    }
    const attachmentIds = outgoing.map((item) => item.id);
    const publicAttachments = outgoing.map((item) => ({
      id: item.id,
      fileId: item.id,
      originalName: item.originalName,
      mimeType: item.mimeType,
      size: item.size,
      kind: item.kind,
    }));
    if (spoken === undefined) {
      setDraft("");
      clearStoredDraft(currentDraftKey);
      setAttachments([]);
    }
    setStreaming(true);
    const pending = optimisticTurn(content, conversationId ?? "pending", publicAttachments, {
      model: modelId,
      provider: providerId,
    });
    setLiveMessages((current) => [...(current ?? messagesQuery.data?.messages ?? []), pending.user, pending.assistant]);
    // Sending is an explicit intent to watch the reply, so re-attach to the bottom
    // even if the reader had scrolled up before submitting.
    pin();
    const controller = new AbortController();
    abortRef.current = controller;
    const body = {
      content,
      providerId,
      modelId,
      ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
      ...(webSearch && !webSearchDisabledReason ? { enabledTools: ["web_search" as const] } : {}),
      ...(activeGptId ? { customGptId: activeGptId } : {}),
    };
    const iterator = conversationId
      ? api.conversations.send(conversationId, body, controller.signal)
      : api.chat.send(body, controller.signal);
    await consumeStream(iterator);
  }

  async function onAddFiles(fileList: File[]): Promise<void> {
    setUploading(true);
    try {
      for (const file of fileList) {
        const reason = attachmentRejection(file, capabilities);
        if (reason) {
          toast(reason, "error");
          continue;
        }
        try {
          const uploaded = await api.files.upload(file);
          setAttachments((current) => [...current, uploaded.file]);
        } catch (err) {
          toast(err instanceof ApiError ? err.message : "Unable to upload file", "error");
        }
      }
    } finally {
      setUploading(false);
    }
  }

  async function onGenerateImage(): Promise<void> {
    const prompt = draft.trim();
    if (!prompt) {
      toast("Enter a prompt to generate an image.", "error");
      return;
    }
    if (imageDisabledReason) {
      toast(imageDisabledReason, "error");
      return;
    }
    setGeneratingImage(true);
    try {
      const generated = await api.tools.generateImage({ prompt });
      setAttachments((current) => [...current, generated.file]);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Image generation is not configured.", "error");
    } finally {
      setGeneratingImage(false);
    }
  }

  async function onVoiceInput(): Promise<void> {
    if (recording) {
      mediaRecorderRef.current?.stop();
      recognitionRef.current?.stop();
      return;
    }
    if (voiceQuery.data?.sttConfigured) {
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
      if (transcript) {
        setDraft((current) => (current.trim() ? `${current.trim()} ${transcript}` : transcript));
      }
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
            if (result.text) {
              setDraft((current) => (current.trim() ? `${current.trim()} ${result.text}` : result.text));
            }
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

  async function copyAssistantText(text: string): Promise<void> {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied", "success");
    } catch {
      toast("Unable to copy", "error");
    }
  }

  /** Resolves when playback finishes, so the live voice loop can resume listening. */
  async function onSpeak(text: string): Promise<void> {
    if (!text.trim()) return;
    if (voiceQuery.data?.ttsConfigured) {
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

  async function onStop(): Promise<void> {
    const id = conversationId;
    if (id) {
      try {
        await api.conversations.abort(id, generationId);
      } catch {
        // Client abort still stops the stream.
      }
    }
    abortRef.current?.abort();
  }

  /**
   * Re-runs the answer at `messageId`, discarding it and every turn after it.
   *
   * The thread is trimmed before the stream opens for the same reason the edit
   * path trims: the "start" event rebuilds from whatever the thread holds then,
   * so the replaced branch has to be gone by the time it arrives.
   */
  async function onRegenerate(messageId: string): Promise<void> {
    if (!conversationId || streaming) return;

    const trimmed = truncateFromMessage(messages, messageId);
    queryClient.setQueryData<{ messages: PublicMessage[] }>(["messages", conversationId], {
      messages: trimmed,
    });
    setLiveMessages(trimmed);

    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    await consumeStream(
      api.conversations.regenerate(conversationId, messageId, controller.signal, { providerId, modelId }),
    );
  }

  /**
   * Re-asks a user turn with new wording and streams the answer.
   *
   * Nothing is trimmed. The server appends the reworded question to the end of
   * the thread, so the existing turns stay exactly where they are and the new
   * exchange arrives underneath them through the "start" event.
   */
  async function onEditMessage(messageId: string, content: string): Promise<void> {
    if (!conversationId || streaming) return;

    setStreaming(true);
    // The reworded question lands at the bottom, so follow it there.
    pin();
    const controller = new AbortController();
    abortRef.current = controller;
    await consumeStream(
      api.conversations.editMessage(conversationId, messageId, content, controller.signal, {
        providerId,
        modelId,
      }),
    );
  }

  const feedbackMutation = useMutation({
    mutationFn: (input: { message: PublicMessage; rating: "up" | "down" }) =>
      // The message carries its own conversation id, so feedback never depends
      // on the route param being settled (it is undefined while a new chat
      // is still navigating to /chat/:conversationId).
      api.conversations.feedback(input.message.conversationId, input.message.id, {
        rating: input.rating,
      }),
    onMutate: (input) => {
      const previous = input.message.feedback;
      patchMessageFeedback(input.message, { rating: input.rating });
      return { previous, message: input.message };
    },
    onError: (err: unknown, _input, context) => {
      if (context) patchMessageFeedback(context.message, context.previous);
      logApiError("conversations.feedback", err);
      toast(describeApiError(err, "Unable to save feedback"), "error");
    },
    onSuccess: async (data) => {
      // The server response is authoritative for what was stored.
      setLiveMessages((current) => (current ? upsertMessage(current, data.message) : current));
      queryClient.setQueryData<{ messages: PublicMessage[] }>(
        ["messages", data.message.conversationId],
        (cached) => (cached ? { messages: upsertMessage(cached.messages, data.message) } : cached),
      );
      toast("Thanks for the feedback", "success");
      await queryClient.invalidateQueries({ queryKey: ["messages", data.message.conversationId] });
    },
  });

  function patchMessageFeedback(
    message: PublicMessage,
    feedback: PublicMessageFeedback | undefined,
  ): void {
    setLiveMessages((current) => (current ? applyFeedback(current, message.id, feedback) : current));
    queryClient.setQueryData<{ messages: PublicMessage[] }>(
      ["messages", message.conversationId],
      (cached) => (cached ? { messages: applyFeedback(cached.messages, message.id, feedback) } : cached),
    );
  }

  const title = currentConversation?.title ?? "Chat";
  const mentioned =
    mentionedGpt ??
    (activeGpt
      ? {
          id: activeGpt.id,
          name: activeGpt.name,
          ...(activeGpt.description ? { description: activeGpt.description } : {}),
        }
      : undefined);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="chat-header flex items-center justify-between gap-2 border-b border-border px-3 py-2 md:px-4">
        <div className="chat-header-start flex min-w-0 items-center gap-1">
          <button
            type="button"
            className="rounded-lg p-2 text-fg-muted hover:bg-surface-muted md:hidden"
            aria-label="Open sidebar"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <h1 className="truncate text-lg font-semibold">{title}</h1>
          {activeGpt ? <p className="chat-gpt-label truncate text-xs text-fg-muted">@{activeGpt.name}</p> : null}
        </div>
        <div className="chat-header-end flex items-center gap-1">
          <ModelSelector
            models={models}
            providerId={providerId}
            modelId={modelId}
            disabled={streaming}
            loading={modelsQuery.isPending}
            onChange={applyThreadSelection}
            onAddModel={() => setKeysPanelOpen(true)}
          />
          {conversationId ? <ShareExportMenu conversationId={conversationId} /> : null}
        </div>
      </header>
      <section
        ref={scrollRef}
        className="chat-messages relative flex-1 overflow-y-auto px-4 py-6"
        aria-label="Messages"
        aria-live="polite"
        aria-busy={streaming || waitingForMessages}
      >
        {waitingForMessages ? (
          <div
            className="chat-thread mx-auto flex w-full max-w-3xl flex-col gap-4"
            aria-busy="true"
            aria-label="Loading messages"
          >
            {Array.from({ length: skeletonCount }, (_, index) => (
              <article key={index} className="chat-message flex gap-3" aria-hidden="true">
                <span className="message-avatar mt-0.5 size-7 shrink-0 rounded-lg border border-border bg-surface-muted" />
                <div className="chat-message-slot min-h-[4.5rem] flex-1 rounded-xl border border-border bg-surface/60" />
              </article>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-2 text-center">
            <p className="chat-empty-title text-3xl font-semibold tracking-tight">
              {activeGpt ? `Chat with ${activeGpt.name}` : "Where should we begin?"}
            </p>
            <p className="text-sm text-fg-muted">
              {activeGpt?.description ?? "Send a message to start a conversation. Type @ to mention a GPT."}
            </p>
            {activeGpt?.conversationStarters.length ? (
              <div className="mt-4 grid w-full gap-2 sm:grid-cols-2">
                {activeGpt.conversationStarters.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    className="rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm hover:bg-surface-muted"
                    onClick={() => setDraft(starter)}
                  >
                    {starter}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className="rounded-full border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-muted"
                  onClick={() => setDraft("Create an image of ")}
                >
                  Create an image
                </button>
                <button
                  type="button"
                  className="rounded-full border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-muted"
                  onClick={() => setDraft("Write or edit ")}
                >
                  Write or edit
                </button>
                <button
                  type="button"
                  className="rounded-full border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-muted"
                  onClick={() => {
                    setWebSearch(true);
                    document.getElementById("composer-input")?.focus();
                  }}
                >
                  Search the web
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="chat-thread mx-auto flex w-full max-w-3xl flex-col gap-4">
            {hiddenCount > 0 ? (
              <button
                type="button"
                className="self-center rounded-full border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-muted"
                onClick={() => setShowAllMessages(true)}
              >
                Show {hiddenCount} earlier messages
              </button>
            ) : null}
            {visibleMessages.map((message, index) => (
              <ChatTurn
                key={message.id}
                message={message}
                {...captionProps(message, models)}
                eagerMarkdown={index >= visibleMessages.length - 3}
                streaming={streaming}
                deepCode={deepCodeTurn && message.status === "streaming"}
                {...(generationEstimate ? { estimate: generationEstimate } : {})}
                ttsConfigured={ttsConfigured}
                ttsUnavailableReason={ttsUnavailableReason}
                feedbackPending={feedbackMutation.isPending}
                onEdit={(id, content) => void onEditMessage(id, content)}
                onRegenerate={(id) => void onRegenerate(id)}
                onCopy={(text) => void copyAssistantText(text)}
                onSpeak={onSpeak}
                onFeedback={(item, rating) => feedbackMutation.mutate({ message: item, rating })}
              />
            ))}
          </div>
        )}
      </section>
      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSubmit={() => void onSubmit()}
        onStop={() => void onStop()}
        streaming={streaming}
        sendOnEnter={user?.preferences?.sendOnEnter ?? false}
        attachments={attachments}
        capabilities={capabilities}
        uploading={uploading}
        onAddFiles={(files) => void onAddFiles(files)}
        onRemoveAttachment={(fileId) => setAttachments((current) => current.filter((item) => item.id !== fileId))}
        webSearchEnabled={webSearch && !webSearchDisabledReason}
        onToggleWebSearch={() => setWebSearch((current) => !current)}
        {...(webSearchDisabledReason ? { webSearchDisabledReason } : {})}
        onGenerateImage={() => void onGenerateImage()}
        {...(imageDisabledReason ? { imageDisabledReason } : {})}
        generatingImage={generatingImage}
        onVoiceInput={() => void onVoiceInput()}
        {...(voiceDisabledReason ? { voiceDisabledReason } : {})}
        recording={recording}
        onLiveVoice={() => setLiveVoiceOpen(true)}
        {...(liveVoiceDisabledReason ? { liveVoiceDisabledReason } : {})}
        mentionCandidates={mentionCandidates}
        {...(mentioned ? { mentioned } : {})}
        onMention={setMentionedGpt}
      />
      {liveVoiceOpen ? (
        <Suspense fallback={null}>
          <LiveVoiceOverlay
            streaming={streaming}
            {...(latestReply ? { replyId: latestReply.id } : {})}
            replyText={latestReply?.content ?? ""}
            canSpeak={ttsConfigured}
            onSend={(text) => void onSubmit(text)}
            onSpeak={onSpeak}
            onClose={() => {
              stopSpeaking();
              setLiveVoiceOpen(false);
            }}
          />
        </Suspense>
      ) : null}
      {keysPanelOpen ? (
        <Suspense fallback={null}>
          <AddModelKeysDialog open onClose={() => setKeysPanelOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}
