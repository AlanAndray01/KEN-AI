import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Menu, RotateCw, ThumbsDown, ThumbsUp, Volume2 } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { PublicConversation, PublicFile, PublicMessage } from "@aether/shared";
import { MessageAttachments } from "@/components/AttachmentChips";
import { ChatComposer } from "@/components/ChatComposer";
import { MarkdownContent } from "@/components/MarkdownContent";
import { ModelSelector } from "@/components/ModelSelector";
import { ShareExportMenu } from "@/components/ShareExportMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, api } from "@/services/api";
import { draftKey, useDraftStore } from "@/stores/draftStore";
import { useModelStore } from "@/stores/modelStore";
import { toast } from "@/stores/toastStore";
import { useUiStore } from "@/stores/uiStore";
import { attachmentRejection } from "@/utils/attachmentGate";
import { appendChunk, dedupeMessages, upsertMessage } from "@/utils/chatMessages";
import type { MentionCandidate } from "@/utils/mentions";

export function ChatPage() {
  const { conversationId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const setMobileOpen = useUiStore((state) => state.setMobileOpen);
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);

  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.conversations.list(),
  });
  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: () => api.models.list(),
  });
  const messagesQuery = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => api.conversations.messages(conversationId ?? ""),
    enabled: Boolean(conversationId),
  });

  const models = useMemo(() => modelsQuery.data?.models ?? [], [modelsQuery.data?.models]);
  const defaultModel = models[0];
  const conversations = conversationsQuery.data?.conversations ?? [];
  const currentConversation = conversations.find((conversation) => conversation.id === conversationId);

  const providerId = storedProviderId || defaultModel?.providerId || "gemini";
  const modelId = storedModelId || defaultModel?.id || "gemini-2.5-flash";
  const selectedModel = models.find((model) => model.providerId === providerId && model.id === modelId) ?? defaultModel;
  const capabilities = selectedModel?.capabilities ?? [];

  const toolsQuery = useQuery({
    queryKey: ["tools", providerId, modelId],
    queryFn: () => api.tools.list(providerId, modelId),
  });
  const voiceQuery = useQuery({
    queryKey: ["voice-status"],
    queryFn: () => api.voice.status(),
  });
  const gptsQuery = useQuery({
    queryKey: ["gpts", "usable"],
    queryFn: () => api.gpts.list({ scope: "usable" }),
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
  const voiceDisabledReason = voiceQuery.data?.sttConfigured
    ? undefined
    : (voiceQuery.data?.message ?? "Voice input is not configured.");
  const ttsConfigured = Boolean(voiceQuery.data?.ttsConfigured);
  const gptParam = searchParams.get("gpt");
  const activeGptId = mentionedGpt?.id ?? currentConversation?.customGptId ?? gptParam ?? undefined;
  const gptQuery = useQuery({
    queryKey: ["gpts", activeGptId],
    queryFn: () => api.gpts.get(activeGptId ?? ""),
    enabled: Boolean(activeGptId),
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
    if (defaultModel && !models.some((model) => model.providerId === providerId && model.id === modelId)) {
      setSelection(defaultModel.providerId, defaultModel.id);
    }
  }, [defaultModel, modelId, models, providerId, setSelection]);

  useEffect(() => {
    if (!currentConversation) return;
    if (appliedConversationRef.current === currentConversation.id) return;
    appliedConversationRef.current = currentConversation.id;
    setSelection(currentConversation.providerId, currentConversation.modelId);
  }, [currentConversation, setSelection]);

  useEffect(() => {
    if (streamConversationRef.current === conversationId) return;
    setLiveMessages(null);
  }, [conversationId]);

  const messages = useMemo(
    () => liveMessages ?? messagesQuery.data?.messages ?? [],
    [liveMessages, messagesQuery.data?.messages],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

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
          const next = [
            ...(event.conversation?.id === conversationId || !conversationId
              ? (messagesQuery.data?.messages ?? liveMessages ?? [])
              : []),
          ];
          if (event.userMessage) next.push(event.userMessage);
          if (event.assistantMessage) next.push(event.assistantMessage);
          setLiveMessages(dedupeMessages(next));
          await queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
        if (event.type === "chunk" && event.text) {
          setLiveMessages((current) => appendChunk(current ?? messages, event.text ?? ""));
        }
        if (event.type === "complete" || event.type === "aborted" || event.type === "error") {
          if (event.assistantMessage) {
            setLiveMessages((current) => upsertMessage(current ?? messages, event.assistantMessage!));
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
      if ((err as { name?: string }).name === "AbortError") return;
      toast(err instanceof ApiError ? err.message : "Unable to send message", "error");
    } finally {
      setStreaming(false);
      setGenerationId(undefined);
      abortRef.current = null;
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (conversationId) {
        await queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
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
    setDraft("");
    clearStoredDraft(currentDraftKey);
    setAttachments([]);
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
    if (voiceDisabledReason) {
      toast(voiceDisabledReason, "error");
      return;
    }
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }
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

  async function onSpeak(text: string): Promise<void> {
    if (!ttsConfigured || !text.trim()) return;
    try {
      const blob = await api.voice.speak(text);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Voice playback is not configured.", "error");
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
    const controller = new AbortController();
    abortRef.current = controller;
    await consumeStream(api.conversations.regenerate(conversationId, messageId, controller.signal));
  }

  const feedbackMutation = useMutation({
    mutationFn: (input: { messageId: string; rating: "up" | "down" }) =>
      api.conversations.feedback(conversationId ?? "", input.messageId, { rating: input.rating }),
    onSuccess: async () => {
      toast("Thanks for the feedback", "success");
      if (conversationId) await queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
    onError: (err: unknown) => {
      toast(err instanceof ApiError ? err.message : "Unable to save feedback", "error");
    },
  });

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
          />
          {conversationId ? <ShareExportMenu conversationId={conversationId} /> : null}
          <ThemeToggle compact />
        </div>
      </header>
      <section
        className="flex-1 overflow-y-auto px-4 py-6"
        aria-label="Messages"
        aria-live="polite"
        aria-busy={streaming}
      >
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-2 text-center">
            <p className="text-2xl font-semibold tracking-tight">
              {activeGpt ? `Chat with ${activeGpt.name}` : "How can I help you today?"}
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
            ) : null}
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            {messages.map((message) => (
              <article key={message.id} className={message.role === "user" ? "flex justify-end" : undefined}>
                {message.role === "user" ? (
                  <div className="max-w-[85%] rounded-3xl bg-surface-muted px-4 py-3">
                    {message.content ? <MarkdownContent>{message.content}</MarkdownContent> : null}
                    {message.attachments?.length ? <MessageAttachments attachments={message.attachments} /> : null}
                  </div>
                ) : (
                  <div className="w-full">
                    <div className="mb-1 text-xs font-medium tracking-wide text-fg-muted uppercase">
                      Aether
                    </div>
                    <MarkdownContent>
                      {message.content || (message.status === "streaming" ? "" : "")}
                    </MarkdownContent>
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
                          className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg"
                          aria-label="Good response"
                          onClick={() => feedbackMutation.mutate({ messageId: message.id, rating: "up" })}
                        >
                          <ThumbsUp className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg"
                          aria-label="Bad response"
                          onClick={() => feedbackMutation.mutate({ messageId: message.id, rating: "down" })}
                        >
                          <ThumbsDown className="size-4" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </article>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
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
    </div>
  );
}
