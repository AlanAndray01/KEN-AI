import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  AUTO_MODEL_ID,
  AUTO_PROVIDER_ID,
  GEMINI_FLASH_MODEL_ID,
  isAutoSelection,
  type PublicConversation,
} from "@Ken/shared";
import { useAuth } from "@/hooks/useAuth";
import { CONVERSATION_STALE_MS, MESSAGE_STALE_MS, QUERY_STALE_MS } from "@/query";
import { api } from "@/services/api";
import { draftKey, useDraftStore } from "@/stores/draftStore";
import { useModelStore } from "@/stores/modelStore";
import { toast } from "@/stores/toastStore";
import { describeApiError } from "@/utils/apiErrors";
import { availableCapabilities } from "@/utils/autoMode";
import { canUseBrowserStt, canUseBrowserTts } from "@/utils/browserSpeech";
import {
  HISTORY_PAGE_SIZE,
  dedupeMessages,
  mergeHistoryPage,
  type MessageHistoryPage,
} from "@/utils/chatMessages";
import { pickDefaultModel, shouldReplaceStoredModel } from "@/utils/defaultModel";
import type { MentionCandidate } from "@/utils/mentions";

export function useChatThread(conversationId?: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const storedProviderId = useModelStore((state) => state.providerId);
  const storedModelId = useModelStore((state) => state.modelId);
  const setSelection = useModelStore((state) => state.setSelection);
  const restoreDefault = useModelStore((state) => state.restoreDefault);
  const persistDraft = useDraftStore((state) => state.setDraft);
  const clearStoredDraft = useDraftStore((state) => state.clearDraft);
  const currentDraftKey = draftKey(conversationId);
  const [draft, setDraft] = useState(() => useDraftStore.getState().drafts[currentDraftKey] ?? "");
  const [mentionedGpt, setMentionedGpt] = useState<MentionCandidate>();
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const appliedConversationRef = useRef<string | undefined>(undefined);
  const userPickedModelRef = useRef(false);

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
    queryFn: async () => {
      const latest = await api.conversations.messages(conversationId ?? "", { limit: HISTORY_PAGE_SIZE });
      const cached = queryClient.getQueryData<MessageHistoryPage>(["messages", conversationId]);
      return mergeHistoryPage(cached, latest);
    },
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
  const voiceDisabledReason =
    voiceQuery.data?.sttConfigured || canUseBrowserStt()
      ? undefined
      : (voiceQuery.data?.message ?? "Voice input is not configured.");
  const ttsConfigured = Boolean(voiceQuery.data?.ttsConfigured) || canUseBrowserTts();
  const ttsUnavailableReason =
    voiceQuery.data?.message ?? "Text-to-speech is not configured, and this browser cannot speak.";
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
    // (the empty-state prompt) as plain text that needs none of it.
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

  async function loadEarlier(container?: HTMLElement | null): Promise<void> {
    if (!conversationId || loadingEarlier) return;
    const cached = queryClient.getQueryData<MessageHistoryPage>(["messages", conversationId]);
    const oldest = cached?.messages[0];
    if (!cached?.hasMore || !oldest) return;
    const previousHeight = container?.scrollHeight ?? 0;
    setLoadingEarlier(true);
    try {
      const older = await api.conversations.messages(conversationId, {
        limit: HISTORY_PAGE_SIZE,
        before: oldest.id,
      });
      queryClient.setQueryData<MessageHistoryPage>(["messages", conversationId], {
        messages: dedupeMessages([...older.messages, ...cached.messages]),
        hasMore: older.hasMore,
      });
      if (container) {
        container.scrollTop += container.scrollHeight - previousHeight;
      }
    } catch (err) {
      toast(describeApiError(err, "Unable to load earlier messages"), "error");
    } finally {
      setLoadingEarlier(false);
    }
  }

  const title = currentConversation?.title ?? "Chat";
  const skeletonCount = Math.min(4, Math.max(2, currentConversation?.messageCount || 2));

  return {
    user,
    draft,
    setDraft,
    currentDraftKey,
    clearStoredDraft,
    providerId,
    modelId,
    models,
    modelsQuery,
    defaultModel,
    capabilities,
    conversations,
    ...(currentConversation ? { currentConversation } : {}),
    messagesQuery,
    hasMore: Boolean(messagesQuery.data?.hasMore),
    loadingEarlier,
    loadEarlier,
    applyThreadSelection,
    ...(webSearchDisabledReason ? { webSearchDisabledReason } : {}),
    ...(imageDisabledReason ? { imageDisabledReason } : {}),
    ...(voiceDisabledReason ? { voiceDisabledReason } : {}),
    ...(liveVoiceDisabledReason ? { liveVoiceDisabledReason } : {}),
    ttsConfigured,
    ttsUnavailableReason,
    serverSttConfigured: Boolean(voiceQuery.data?.sttConfigured),
    serverTtsConfigured: Boolean(voiceQuery.data?.ttsConfigured),
    ...(mentionedGpt ? { mentionedGpt } : {}),
    setMentionedGpt,
    mentionCandidates,
    ...(activeGpt ? { activeGpt } : {}),
    ...(activeGptId ? { activeGptId } : {}),
    title,
    skeletonCount,
  };
}
