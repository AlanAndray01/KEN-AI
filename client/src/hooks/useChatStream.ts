import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { PublicFile, PublicMessage, PublicMessageFeedback } from "@Ken/shared";
import type { GenerationEstimate } from "@/components/CodeGenerationTicker";
import { useStreamBuffer } from "@/hooks/useStreamBuffer";
import type { ChatStreamEvent } from "@/services/api";
import { api } from "@/services/api";
import { toast } from "@/stores/toastStore";
import { describeApiError, describeGenerationError, logApiError } from "@/utils/apiErrors";
import {
  appendChunk,
  applyAssistantModel,
  applyFeedback,
  finishAssistantTurn,
  markLastAssistant,
  mergeMessagePages,
  optimisticTurn,
  patchCachedMessages,
  startTurn,
  truncateFromMessage,
  upsertMessage,
  type MessageHistoryPage,
} from "@/utils/chatMessages";

type StreamEvent = ChatStreamEvent & { modelName?: string };

export function useChatStream(options: {
  conversationId?: string;
  providerId: string;
  modelId: string;
  modelsPending: boolean;
  modelsError: boolean;
  modelsErrorValue: unknown;
  hasConfiguredModel: boolean;
  cachedMessages: PublicMessage[];
  draft: string;
  setDraft: (value: string) => void;
  currentDraftKey: string;
  clearStoredDraft: (key: string) => void;
  attachments: PublicFile[];
  uploading: boolean;
  clearAttachments: () => void;
  webSearch: boolean;
  webSearchDisabledReason?: string;
  activeGptId?: string;
  applyThreadSelection: (provider: string, model: string) => void;
  pin: () => void;
  stickToBottom: () => void;
}): {
  messages: PublicMessage[];
  liveMessages: PublicMessage[] | null;
  streaming: boolean;
  deepCodeTurn: boolean;
  generationEstimate?: GenerationEstimate;
  latestReply?: PublicMessage;
  feedbackPending: boolean;
  onSubmit: (spoken?: string) => Promise<void>;
  onStop: () => Promise<void>;
  onRegenerate: (messageId: string) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onFeedback: (message: PublicMessage, rating: "up" | "down") => void;
} {
  const {
    conversationId,
    providerId,
    modelId,
    modelsPending,
    modelsError,
    modelsErrorValue,
    hasConfiguredModel,
    cachedMessages,
    draft,
    setDraft,
    currentDraftKey,
    clearStoredDraft,
    attachments,
    uploading,
    clearAttachments,
    webSearch,
    webSearchDisabledReason,
    activeGptId,
    applyThreadSelection,
    pin,
    stickToBottom,
  } = options;

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [streaming, setStreaming] = useState(false);
  const [generationId, setGenerationId] = useState<string>();
  const [liveMessages, setLiveMessages] = useState<PublicMessage[] | null>(null);
  const [deepCodeTurn, setDeepCodeTurn] = useState(false);
  const [generationEstimate, setGenerationEstimate] = useState<GenerationEstimate>();
  const abortRef = useRef<AbortController | null>(null);
  const streamConversationRef = useRef<string | undefined>(undefined);
  const messagesRef = useRef<PublicMessage[]>([]);

  const messages = useMemo(
    () => mergeMessagePages(cachedMessages, liveMessages ?? cachedMessages),
    [cachedMessages, liveMessages],
  );
  messagesRef.current = messages;

  const { push: pushChunk, flush: flushChunks, reset: resetChunks } = useStreamBuffer((text) => {
    setLiveMessages((current) => appendChunk(current ?? messagesRef.current, text));
  });

  useEffect(() => {
    if (streamConversationRef.current === conversationId) return;
    setLiveMessages(null);
  }, [conversationId]);

  useEffect(() => {
    resetChunks();
  }, [conversationId, resetChunks]);

  useEffect(() => {
    stickToBottom();
  }, [messages, stickToBottom]);

  useEffect(() => {
    pin();
  }, [conversationId, pin]);

  const latestReply = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === "assistant" && message.status !== "streaming"),
    [messages],
  );

  async function consumeStream(iterator: AsyncGenerator<StreamEvent>): Promise<void> {
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
            // pre-trim cache — using it would resurrect the branch the edit
            // was meant to discard.
            const base = sameConversation
              ? (current ??
                queryClient.getQueryData<MessageHistoryPage>(["messages", conversationId])?.messages ??
                [])
              : [];
            return startTurn(base, event.userMessage, event.assistantMessage);
          });
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
        if (event.type === "model" && (event.model || event.assistantMessage?.model)) {
          const model = event.model ?? event.assistantMessage?.model;
          const provider = event.provider ?? event.assistantMessage?.provider;
          if (!model) continue;
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
          // Flush leftover tokens and the finished row in one commit *before*
          // dropping `streaming`. A later setState left the last paint on the
          // caret, then remounted markdown on an empty/truncated card.
          flushSync(() => {
            flushChunks();
            if (event.assistantMessage) {
              const finished = event.assistantMessage;
              setLiveMessages((current) => finishAssistantTurn(current ?? messagesRef.current, finished));
            } else if (event.type === "error") {
              setLiveMessages((current) => markLastAssistant(current ?? messagesRef.current, "error"));
            } else if (event.type === "aborted") {
              setLiveMessages((current) => markLastAssistant(current ?? messagesRef.current, "aborted"));
            }
            setStreaming(false);
          });
          if (event.type === "error") {
            toast(describeGenerationError(event.code, event.message), "error");
          }
          if (event.type === "aborted") {
            toast("Generation stopped", "info");
          }
        }
      }
    } catch (err) {
      const timedOut = (err as { name?: string }).name === "AbortError";
      const clientStop = timedOut && abortRef.current?.signal.aborted;
      flushSync(() => {
        flushChunks();
        if (!clientStop) {
          setLiveMessages((current) => markLastAssistant(current ?? messagesRef.current, "error"));
        }
        setStreaming(false);
      });
      if (clientStop) return;
      if (timedOut) {
        toast("The model took too long to respond.", "error");
        return;
      }
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
    if (modelsPending) {
      toast("Models are still loading. Try again in a moment.", "error");
      return;
    }
    if (modelsError) {
      toast(describeApiError(modelsErrorValue, "Unable to load models"), "error");
      return;
    }
    if (!hasConfiguredModel) {
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
      clearAttachments();
    }
    setStreaming(true);
    const pending = optimisticTurn(content, conversationId ?? "pending", publicAttachments, {
      model: modelId,
      provider: providerId,
    });
    setLiveMessages((current) => [...(current ?? cachedMessages), pending.user, pending.assistant]);
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
    queryClient.setQueryData<MessageHistoryPage>(["messages", conversationId], (cached) =>
      patchCachedMessages(cached, trimmed),
    );
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
      setLiveMessages((current) => (current ? upsertMessage(current, data.message) : current));
      queryClient.setQueryData<MessageHistoryPage>(
        ["messages", data.message.conversationId],
        (cached) => (cached ? { ...cached, messages: upsertMessage(cached.messages, data.message) } : cached),
      );
      toast("Thanks for the feedback", "success");
      await queryClient.invalidateQueries({ queryKey: ["messages", data.message.conversationId] });
    },
  });

  function patchMessageFeedback(message: PublicMessage, feedback: PublicMessageFeedback | undefined): void {
    setLiveMessages((current) => (current ? applyFeedback(current, message.id, feedback) : current));
    queryClient.setQueryData<MessageHistoryPage>(
      ["messages", message.conversationId],
      (cached) => (cached ? { ...cached, messages: applyFeedback(cached.messages, message.id, feedback) } : cached),
    );
  }

  return {
    messages,
    liveMessages,
    streaming,
    deepCodeTurn,
    ...(generationEstimate ? { generationEstimate } : {}),
    ...(latestReply ? { latestReply } : {}),
    feedbackPending: feedbackMutation.isPending,
    onSubmit,
    onStop,
    onRegenerate,
    onEditMessage,
    onFeedback: (message, rating) => feedbackMutation.mutate({ message, rating }),
  };
}
