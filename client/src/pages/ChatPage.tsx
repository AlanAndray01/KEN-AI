import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Menu, RotateCw, ThumbsDown, ThumbsUp, Volume2 } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  DEFAULT_GROQ_MODEL_ID,
  type PublicConversation,
  type PublicFile,
  type PublicMessage,
  type PublicMessageFeedback,
} from "@aether/shared";
import { AddModelKeysDialog } from "@/components/AddModelKeysDialog";
import { MessageAttachments } from "@/components/AttachmentChips";
import { ChatComposer } from "@/components/ChatComposer";
import { LazyMarkdown } from "@/components/LazyMarkdown";
import { AssistantRichBody } from "@/components/RichContent";
import { ModelSelector } from "@/components/ModelSelector";
import { ShareExportMenu } from "@/components/ShareExportMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThinkingPipeline } from "@/components/ThinkingPipeline";
import { UserMessageBubble } from "@/components/UserMessageBubble";
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
import { canUseBrowserStt, canUseBrowserTts, getSpeechRecognition, speakWithBrowser } from "@/utils/browserSpeech";
import { appendChunk, applyFeedback, CHAT_MESSAGE_WINDOW, dedupeMessages, markLastAssistant, optimisticTurn, upsertMessage } from "@/utils/chatMessages";
import { pickDefaultModel, shouldReplaceStoredModel } from "@/utils/defaultModel";
import { cn } from "@/utils/cn";
import type { MentionCandidate } from "@/utils/mentions";

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
  const [mentionedGpt, setMentionedGpt] = useState<MentionCandidate>();
  const abortRef = useRef<AbortController | null>(null);
  const streamConversationRef = useRef<string | undefined>(undefined);
  const appliedConversationRef = useRef<string | undefined>(undefined);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const messagesRef = useRef<PublicMessage[]>([]);
  const {
    containerRef: scrollRef,
    pinned,
    stickToBottom,
    pin,
  } = useStickToBottom<HTMLElement>();
  const [, startTransition] = useTransition();
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
    queryFn: () => api.conversations.messages(conversationId ?? ""),
    enabled: Boolean(conversationId),
    staleTime: MESSAGE_STALE_MS,
  });

  const models = useMemo(() => modelsQuery.data?.models ?? [], [modelsQuery.data?.models]);
  const defaultModel = useMemo(() => pickDefaultModel(models), [models]);
  const conversations = conversationsQuery.data?.conversations ?? [];
  const currentConversation = conversations.find((conversation) => conversation.id === conversationId);

  const providerId = storedProviderId || defaultModel?.providerId || "groq";
  const modelId = storedModelId || defaultModel?.id || DEFAULT_GROQ_MODEL_ID;
  const selectedModel = models.find((model) => model.providerId === providerId && model.id === modelId) ?? defaultModel;
  const capabilities = selectedModel?.capabilities ?? [];

  const toolsQuery = useQuery({
    queryKey: ["tools", providerId, modelId],
    queryFn: () => api.tools.list(providerId, modelId),
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
        if (gpt.providerId && gpt.modelId) setSelection(gpt.providerId, gpt.modelId);
        setSearchParams({}, { replace: true });
      })
      .catch(() => toast("GPT not found", "error"));
  }, [gptParam, setSearchParams, setSelection]);

  useEffect(() => {
    if (!defaultModel || models.length === 0 || currentConversation) return;
    if (!shouldReplaceStoredModel({ providerId, modelId }, defaultModel, models)) return;
    if (defaultModel.providerId === providerId && defaultModel.id === modelId) return;
    setSelection(defaultModel.providerId, defaultModel.id);
  }, [currentConversation, defaultModel, modelId, models, providerId, setSelection]);

  useEffect(() => {
    if (!currentConversation) return;
    if (appliedConversationRef.current === currentConversation.id) return;
    appliedConversationRef.current = currentConversation.id;
    if (
      defaultModel &&
      shouldReplaceStoredModel(
        { providerId: currentConversation.providerId, modelId: currentConversation.modelId },
        defaultModel,
        models,
      )
    ) {
      setSelection(defaultModel.providerId, defaultModel.id);
      return;
    }
    setSelection(currentConversation.providerId, currentConversation.modelId);
  }, [currentConversation, defaultModel, models, setSelection]);

  useEffect(() => {
    if (streamConversationRef.current === conversationId) return;
    setLiveMessages(null);
  }, [conversationId]);

  const messages = useMemo(
    () => liveMessages ?? messagesQuery.data?.messages ?? [],
    [liveMessages, messagesQuery.data?.messages],
  );
  messagesRef.current = messages;

  const { push: pushChunk, flush: flushChunks, reset: resetChunks } = useStreamBuffer((text) => {
    startTransition(() => {
      setLiveMessages((current) => appendChunk(current ?? messagesRef.current, text));
    });
  });

  useEffect(() => {
    resetChunks();
    setShowAllMessages(false);
  }, [conversationId, resetChunks]);

  const hiddenCount =
    showAllMessages || messages.length <= CHAT_MESSAGE_WINDOW ? 0 : messages.length - CHAT_MESSAGE_WINDOW;
  const visibleMessages = hiddenCount > 0 ? messages.slice(-CHAT_MESSAGE_WINDOW) : messages;

  // Follow the newest tokens only while the reader is already at the bottom, so
  // scrolling up mid-stream to re-read something is not yanked back every frame.
  useEffect(() => {
    stickToBottom();
  }, [messages, stickToBottom]);

  // A new conversation always starts pinned to its latest turn.
  useEffect(() => {
    pin();
  }, [conversationId, pin]);

  async function consumeStream(
    iterator: AsyncGenerator<{
      type: string;
      conversation?: PublicConversation;
      userMessage?: PublicMessage;
      assistantMessage?: PublicMessage;
      generationId?: string;
      text?: string;
      message?: string;
    }>,
  ): Promise<void> {
    setStreaming(true);
    try {
      for await (const event of iterator) {
        if (event.type === "start") {
          if (event.generationId) setGenerationId(event.generationId);
          if (event.conversation) {
            streamConversationRef.current = event.conversation.id;
            if (event.conversation.id !== conversationId) {
              void navigate(`/chat/${event.conversation.id}`);
            }
          }
          setLiveMessages((current) => {
            const history =
              event.conversation?.id === conversationId || !conversationId
                ? (messagesQuery.data?.messages ?? [])
                : [];
            const next = [...history];
            if (event.userMessage) next.push(event.userMessage);
            if (event.assistantMessage) {
              const streamed = [...(current ?? [])].reverse().find((message) => message.role === "assistant");
              next.push(
                streamed?.content && !event.assistantMessage.content
                  ? { ...event.assistantMessage, content: streamed.content, status: "streaming" }
                  : event.assistantMessage,
              );
            }
            return dedupeMessages(next);
          });
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
        if (event.type === "chunk" && event.text) {
          pushChunk(event.text);
        }
        if (event.type === "complete" || event.type === "aborted" || event.type === "error") {
          flushChunks();
          if (event.assistantMessage) {
            setLiveMessages((current) => upsertMessage(current ?? messages, event.assistantMessage!));
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
      setGenerationId(undefined);
      abortRef.current = null;
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      const activeId = streamConversationRef.current ?? conversationId;
      if (activeId) {
        await queryClient.invalidateQueries({ queryKey: ["messages", activeId] });
      }
    }
  }

  async function onSubmit(): Promise<void> {
    const content = draft.trim();
    if ((!content && attachments.length === 0) || streaming || uploading) return;
    if (!defaultModel && models.length === 0) {
      toast("No AI provider configured.", "error");
      return;
    }
    const attachmentIds = attachments.map((item) => item.id);
    const publicAttachments = attachments.map((item) => ({
      id: item.id,
      fileId: item.id,
      originalName: item.originalName,
      mimeType: item.mimeType,
      size: item.size,
      kind: item.kind,
    }));
    setDraft("");
    clearStoredDraft(currentDraftKey);
    setAttachments([]);
    setStreaming(true);
    const pending = optimisticTurn(content, conversationId ?? "pending", publicAttachments);
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

  async function onSpeak(text: string): Promise<void> {
    if (!text.trim()) return;
    if (voiceQuery.data?.ttsConfigured) {
      try {
        const blob = await api.voice.speak(text);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play();
        return;
      } catch (err) {
        if (speakWithBrowser(text)) return;
        toast(err instanceof ApiError ? err.message : "Voice playback is not configured.", "error");
        return;
      }
    }
    if (!speakWithBrowser(text)) {
      toast("Voice playback is not configured.", "error");
    }
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

  async function onRegenerate(messageId: string): Promise<void> {
    if (!conversationId || streaming) return;
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    await consumeStream(api.conversations.regenerate(conversationId, messageId, controller.signal));
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

  const lastAssistant = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant"),
    [messages],
  );

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
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 md:px-4">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            className="rounded-lg p-2 text-fg-muted hover:bg-surface-muted md:hidden"
            aria-label="Open sidebar"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <h1 className="truncate text-lg font-semibold">{title}</h1>
          {activeGpt ? <p className="truncate text-xs text-fg-muted">@{activeGpt.name}</p> : null}
        </div>
        <div className="flex items-center gap-1">
          <ModelSelector
            models={models}
            providerId={providerId}
            modelId={modelId}
            disabled={streaming}
            onChange={(nextProvider, nextModel) => setSelection(nextProvider, nextModel)}
            onAddModel={() => setKeysPanelOpen(true)}
          />
          {conversationId ? <ShareExportMenu conversationId={conversationId} /> : null}
          <ThemeToggle compact />
        </div>
      </header>
      <section
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto px-4 py-6"
        aria-label="Messages"
        aria-live="polite"
        aria-busy={streaming}
      >
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-2 text-center">
            <p className="text-3xl font-semibold tracking-tight">
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
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            {hiddenCount > 0 ? (
              <button
                type="button"
                className="self-center rounded-full border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-muted"
                onClick={() => setShowAllMessages(true)}
              >
                Show {hiddenCount} earlier messages
              </button>
            ) : null}
            {visibleMessages.map((message) => (
              <article
                key={message.id}
                className={message.role === "user" ? "chat-message flex justify-end" : "chat-message"}
              >
                {message.role === "user" ? (
                  <UserMessageBubble content={message.content}>
                    {message.attachments?.length ? <MessageAttachments attachments={message.attachments} /> : null}
                  </UserMessageBubble>
                ) : (
                  <div className="w-full rounded-2xl px-4 py-3 text-fg">
                    {message.content ? (
                      <>
                        {message.status === "streaming" ? (
                          <LazyMarkdown>{message.content}</LazyMarkdown>
                        ) : (
                          <AssistantRichBody content={message.content} />
                        )}
                        {message.status === "streaming" ? <span className="streaming-caret" aria-hidden="true" /> : null}
                      </>
                    ) : message.status === "streaming" ? (
                      <ThinkingPipeline />
                    ) : message.status === "error" ? (
                      <div role="alert" className="rounded-xl border border-danger/40 bg-surface px-4 py-3">
                        <p className="font-medium">Generation failed</p>
                        <p className="mt-1 text-sm text-fg-muted">
                          The model dropped or returned an error. You can retry this turn.
                        </p>
                        {message.id === lastAssistant?.id ? (
                          <button
                            type="button"
                            className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-50"
                            disabled={streaming}
                            onClick={() => void onRegenerate(message.id)}
                          >
                            Retry
                          </button>
                        ) : null}
                      </div>
                    ) : message.status === "aborted" ? (
                      <p className="text-sm text-fg-muted">Generation stopped.</p>
                    ) : (
                      <p className="text-sm text-fg-muted">No reply was generated. Try sending again.</p>
                    )}
                    {message.role === "assistant" && message.id === lastAssistant?.id ? (
                      <div className="mt-2 flex gap-1">
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-50"
                          disabled={streaming}
                          aria-label="Regenerate"
                          onClick={() => void onRegenerate(message.id)}
                        >
                          <RotateCw className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-50"
                          disabled={!message.content}
                          aria-label="Copy"
                          onClick={() => void copyAssistantText(message.content)}
                        >
                          <Copy className="size-4" />
                        </button>
                        {ttsConfigured ? (
                          <button
                            type="button"
                            className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-50"
                            disabled={streaming || !message.content}
                            aria-label="Play audio"
                            onClick={() => void onSpeak(message.content)}
                          >
                            <Volume2 className="size-4" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={cn(
                            "rounded-lg p-1.5 hover:bg-surface-muted hover:text-fg disabled:opacity-50",
                            message.feedback?.rating === "up" ? "text-accent" : "text-fg-muted",
                          )}
                          aria-label="Good response"
                          aria-pressed={message.feedback?.rating === "up"}
                          disabled={feedbackMutation.isPending}
                          onClick={() => feedbackMutation.mutate({ message, rating: "up" })}
                        >
                          <ThumbsUp className="size-4" />
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "rounded-lg p-1.5 hover:bg-surface-muted hover:text-fg disabled:opacity-50",
                            message.feedback?.rating === "down" ? "text-accent" : "text-fg-muted",
                          )}
                          aria-label="Bad response"
                          aria-pressed={message.feedback?.rating === "down"}
                          disabled={feedbackMutation.isPending}
                          onClick={() => feedbackMutation.mutate({ message, rating: "down" })}
                        >
                          <ThumbsDown className="size-4" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
        {!pinned && messages.length > 0 ? (
          <div className="sticky bottom-2 flex justify-center">
            <button
              type="button"
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-fg-muted shadow-sm hover:bg-surface-muted"
              onClick={() => pin()}
            >
              {streaming ? "Jump to latest" : "Scroll to bottom"}
            </button>
          </div>
        ) : null}
      </section>
      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSubmit={() => void onSubmit()}
        onStop={() => void onStop()}
        streaming={streaming}
        sendOnEnter={user?.preferences?.sendOnEnter ?? true}
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
        mentionCandidates={mentionCandidates}
        {...(mentioned ? { mentioned } : {})}
        onMention={setMentionedGpt}
      />
      <AddModelKeysDialog open={keysPanelOpen} onClose={() => setKeysPanelOpen(false)} />
    </div>
  );
}
