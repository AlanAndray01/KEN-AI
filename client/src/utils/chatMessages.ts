import type { PublicMessage } from "@aether/shared";

export function dedupeMessages(messages: PublicMessage[]): PublicMessage[] {
  const seen = new Set<string>();
  const result: PublicMessage[] = [];
  for (const message of messages) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    result.push(message);
  }
  return result;
}

export function appendChunk(messages: PublicMessage[], text: string): PublicMessage[] {
  const copy = [...messages];
  for (let index = copy.length - 1; index >= 0; index -= 1) {
    const message = copy[index];
    if (message?.role === "assistant") {
      copy[index] = { ...message, content: `${message.content}${text}`, status: "streaming" };
      return copy;
    }
  }
  return copy;
}

export function upsertMessage(messages: PublicMessage[], next: PublicMessage): PublicMessage[] {
  const copy = [...messages];
  const index = copy.findIndex((message) => message.id === next.id);
  if (index >= 0) {
    copy[index] = next;
    return copy;
  }
  copy.push(next);
  return copy;
}
