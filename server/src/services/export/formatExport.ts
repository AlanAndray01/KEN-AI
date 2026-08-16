import type { ExportFormat } from "@aether/shared";

export interface ExportMessage {
  role: string;
  content: string;
  createdAt: string;
}

export interface ExportConversation {
  id?: string;
  title: string;
  createdAt: string;
  messages: ExportMessage[];
}

export function safeExportFilename(title: string): string {
  const compact = title
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return compact || "conversation";
}

export function formatExport(conversations: ExportConversation[], format: ExportFormat): string {
  if (format === "json") {
    return `${JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        conversations: conversations.map((conversation) => ({
          ...(conversation.id ? { id: conversation.id } : {}),
          title: conversation.title,
          createdAt: conversation.createdAt,
          messages: conversation.messages.map((message) => ({
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
          })),
        })),
      },
      null,
      2,
    )}\n`;
  }

  const blocks = conversations.map((conversation) => {
    const heading = format === "md" ? `# ${conversation.title}` : conversation.title;
    const body = conversation.messages
      .map((message) => {
        const speaker = message.role === "assistant" ? "Aether" : "User";
        if (format === "md") {
          return `**${speaker}** (${message.createdAt})\n\n${message.content || "_(empty)_"}`;
        }
        return `${speaker} (${message.createdAt})\n${message.content}`;
      })
      .join(format === "md" ? "\n\n---\n\n" : "\n\n");
    return body ? `${heading}\n\n${body}` : heading;
  });

  return `${blocks.join(format === "md" ? "\n\n\n" : "\n\n==========\n\n")}\n`;
}

export function exportMimeType(format: ExportFormat): string {
  if (format === "json") return "application/json; charset=utf-8";
  if (format === "md") return "text/markdown; charset=utf-8";
  return "text/plain; charset=utf-8";
}

export function exportExtension(format: ExportFormat): string {
  return format;
}
