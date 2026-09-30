import { lazy, Suspense } from "react";
import { Menu } from "lucide-react";
import { useParams } from "react-router-dom";
import { ChatComposer } from "@/components/ChatComposer";
import { ChatTurn } from "@/components/ChatTurn";
import { ModelSelector } from "@/components/ModelSelector";
import { ShareExportMenu } from "@/components/ShareExportMenu";
import { useChatAttachments } from "@/hooks/useChatAttachments";
import { useChatStream } from "@/hooks/useChatStream";
import { useChatThread } from "@/hooks/useChatThread";
import { useChatVoice } from "@/hooks/useChatVoice";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import { toast } from "@/stores/toastStore";
import { useUiStore } from "@/stores/uiStore";
import { captionProps } from "@/utils/autoMode";
import { priorUserContent } from "@/utils/chatMessages";

const AddModelKeysDialog = lazy(() =>
  import("@/components/AddModelKeysDialog").then((mod) => ({ default: mod.AddModelKeysDialog })),
);
const LiveVoiceOverlay = lazy(() =>
  import("@/components/LiveVoiceOverlay").then((mod) => ({ default: mod.LiveVoiceOverlay })),
);

export function ChatPage() {
  const { conversationId } = useParams();
  const setMobileOpen = useUiStore((state) => state.setMobileOpen);
  const keysPanelOpen = useUiStore((state) => state.keysPanelOpen);
  const setKeysPanelOpen = useUiStore((state) => state.setKeysPanelOpen);
  const { containerRef: scrollRef, stickToBottom, pin } = useStickToBottom<HTMLElement>();

  const thread = useChatThread(conversationId);
  const attachments = useChatAttachments({
    capabilities: thread.capabilities,
    ...(thread.imageDisabledReason ? { imageDisabledReason: thread.imageDisabledReason } : {}),
    draft: thread.draft,
  });
  const voice = useChatVoice({
    sttConfigured: thread.serverSttConfigured,
    ttsConfigured: thread.serverTtsConfigured,
    ...(thread.voiceDisabledReason ? { voiceDisabledReason: thread.voiceDisabledReason } : {}),
    onTranscript: (text) =>
      thread.setDraft((current) => (current.trim() ? `${current.trim()} ${text}` : text)),
  });
  const stream = useChatStream({
    ...(conversationId ? { conversationId } : {}),
    providerId: thread.providerId,
    modelId: thread.modelId,
    modelsPending: thread.modelsQuery.isPending,
    modelsError: thread.modelsQuery.isError,
    modelsErrorValue: thread.modelsQuery.error,
    hasConfiguredModel: Boolean(thread.defaultModel) || thread.models.length > 0,
    cachedMessages: thread.messagesQuery.data?.messages ?? [],
    draft: thread.draft,
    setDraft: (value) => thread.setDraft(value),
    currentDraftKey: thread.currentDraftKey,
    clearStoredDraft: thread.clearStoredDraft,
    attachments: attachments.attachments,
    uploading: attachments.uploading,
    clearAttachments: attachments.clearAttachments,
    webSearch: attachments.webSearch,
    ...(thread.webSearchDisabledReason ? { webSearchDisabledReason: thread.webSearchDisabledReason } : {}),
    ...(thread.activeGptId ? { activeGptId: thread.activeGptId } : {}),
    applyThreadSelection: thread.applyThreadSelection,
    pin,
    stickToBottom,
  });

  const waitingForMessages =
    Boolean(conversationId) && thread.messagesQuery.isPending && stream.liveMessages === null;
  const mentioned =
    thread.mentionedGpt ??
    (thread.activeGpt
      ? {
          id: thread.activeGpt.id,
          name: thread.activeGpt.name,
          ...(thread.activeGpt.description ? { description: thread.activeGpt.description } : {}),
        }
      : undefined);

  async function copyAssistantText(text: string): Promise<void> {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied", "success");
    } catch {
      toast("Unable to copy", "error");
    }
  }

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
          <h1 className="truncate text-lg font-semibold">{thread.title}</h1>
          {thread.activeGpt ? (
            <p className="chat-gpt-label truncate text-xs text-fg-muted">@{thread.activeGpt.name}</p>
          ) : null}
        </div>
        <div className="chat-header-end flex items-center gap-1">
          <ModelSelector
            models={thread.models}
            providerId={thread.providerId}
            modelId={thread.modelId}
            disabled={stream.streaming}
            loading={thread.modelsQuery.isPending}
            onChange={thread.applyThreadSelection}
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
        aria-busy={stream.streaming || waitingForMessages}
      >
        {waitingForMessages ? (
          <div
            className="chat-thread mx-auto flex w-full max-w-3xl flex-col gap-4"
            aria-busy="true"
            aria-label="Loading messages"
          >
            {Array.from({ length: thread.skeletonCount }, (_, index) => (
              <article key={index} className="chat-message flex gap-3" aria-hidden="true">
                <span className="message-avatar mt-0.5 size-7 shrink-0 rounded-lg border border-border bg-surface-muted" />
                <div className="chat-message-slot min-h-[4.5rem] flex-1 rounded-xl border border-border bg-surface/60" />
              </article>
            ))}
          </div>
        ) : stream.messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-2 text-center">
            <p className="chat-empty-title text-3xl font-semibold tracking-tight">
              {thread.activeGpt ? `Chat with ${thread.activeGpt.name}` : "Where should we begin?"}
            </p>
            <p className="text-sm text-fg-muted">
              {thread.activeGpt?.description ?? "Send a message to start a conversation. Type @ to mention a GPT."}
            </p>
            {thread.activeGpt?.conversationStarters.length ? (
              <div className="mt-4 grid w-full gap-2 sm:grid-cols-2">
                {thread.activeGpt.conversationStarters.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    className="rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm hover:bg-surface-muted"
                    onClick={() => thread.setDraft(starter)}
                  >
                    {starter}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {/* Only suggest a tool the site can actually run right now. */}
                {thread.imageDisabledReason ? null : (
                  <button
                    type="button"
                    className="rounded-full border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-muted"
                    onClick={() => thread.setDraft("Create an image of ")}
                  >
                    Create an image
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-full border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-muted"
                  onClick={() => thread.setDraft("Write or edit ")}
                >
                  Write or edit
                </button>
                <button
                  type="button"
                  className="rounded-full border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-muted"
                  onClick={() => thread.setDraft("Explain simply: ")}
                >
                  Explain something
                </button>
                {thread.webSearchDisabledReason ? null : (
                  <button
                    type="button"
                    className="rounded-full border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-muted"
                    onClick={() => {
                      attachments.setWebSearch(true);
                      document.getElementById("composer-input")?.focus();
                    }}
                  >
                    Search the web
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="chat-thread mx-auto flex w-full max-w-3xl flex-col gap-4">
            {thread.hasMore ? (
              <button
                type="button"
                className="self-center rounded-full border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-muted disabled:opacity-60"
                disabled={thread.loadingEarlier}
                onClick={() => void thread.loadEarlier(scrollRef.current)}
              >
                {thread.loadingEarlier ? "Loading earlier messages" : "Load earlier messages"}
              </button>
            ) : null}
            {stream.messages.map((message, index) => {
              const remixPrompt =
                message.role === "assistant" ? priorUserContent(stream.messages, message) : undefined;
              return (
                <ChatTurn
                  key={message.id}
                  message={message}
                  {...captionProps(message, thread.models)}
                  eagerMarkdown={index >= stream.messages.length - 3}
                  streaming={stream.streaming}
                  deepCode={stream.deepCodeTurn && message.status === "streaming"}
                  {...(stream.generationEstimate ? { estimate: stream.generationEstimate } : {})}
                  ttsConfigured={thread.ttsConfigured}
                  ttsUnavailableReason={thread.ttsUnavailableReason}
                  feedbackPending={stream.feedbackPending}
                  onEdit={(id, content) => void stream.onEditMessage(id, content)}
                  onRegenerate={(id) => void stream.onRegenerate(id)}
                  onCopy={(text) => void copyAssistantText(text)}
                  onSpeak={voice.onSpeak}
                  onFeedback={(item, rating) => stream.onFeedback(item, rating)}
                  {...(remixPrompt
                    ? {
                        remixPrompt,
                        onRemixImage: (prompt: string) => {
                          thread.setDraft(prompt);
                          document.getElementById("composer-input")?.focus();
                        },
                      }
                    : {})}
                />
              );
            })}
          </div>
        )}
      </section>
      <ChatComposer
        value={thread.draft}
        onChange={thread.setDraft}
        onSubmit={() => void stream.onSubmit()}
        onStop={() => void stream.onStop()}
        streaming={stream.streaming}
        attachments={attachments.attachments}
        capabilities={thread.capabilities}
        uploading={attachments.uploading}
        onAddFiles={(files) => void attachments.onAddFiles(files)}
        onRemoveAttachment={attachments.onRemoveAttachment}
        webSearchEnabled={attachments.webSearch && !thread.webSearchDisabledReason}
        onToggleWebSearch={() => attachments.setWebSearch((current) => !current)}
        {...(thread.webSearchDisabledReason ? { webSearchDisabledReason: thread.webSearchDisabledReason } : {})}
        onGenerateImage={() => void attachments.onGenerateImage()}
        {...(thread.imageDisabledReason ? { imageDisabledReason: thread.imageDisabledReason } : {})}
        generatingImage={attachments.generatingImage}
        onVoiceInput={() => void voice.onVoiceInput()}
        {...(thread.voiceDisabledReason ? { voiceDisabledReason: thread.voiceDisabledReason } : {})}
        recording={voice.recording}
        onLiveVoice={() => voice.setLiveVoiceOpen(true)}
        {...(thread.liveVoiceDisabledReason ? { liveVoiceDisabledReason: thread.liveVoiceDisabledReason } : {})}
        mentionCandidates={thread.mentionCandidates}
        {...(mentioned ? { mentioned } : {})}
        onMention={thread.setMentionedGpt}
      />
      {voice.liveVoiceOpen ? (
        <Suspense fallback={null}>
          <LiveVoiceOverlay
            streaming={stream.streaming}
            {...(stream.latestReply ? { replyId: stream.latestReply.id } : {})}
            replyText={stream.latestReply?.content ?? ""}
            canSpeak={thread.ttsConfigured}
            onSend={(text) => void stream.onSubmit(text)}
            onSpeak={voice.onSpeak}
            onClose={() => {
              voice.stopSpeaking();
              voice.setLiveVoiceOpen(false);
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
