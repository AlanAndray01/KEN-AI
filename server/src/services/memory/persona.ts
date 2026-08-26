import type { ChatMessage } from "../ai/AIProvider.js";
import { getAccessibleGpt } from "../gpts/gptService.js";
import { loadOwnedFiles, materializeFilesForModel } from "../storage/fileService.js";
import { getInstructions } from "./instructionService.js";
import { listMemories } from "./memoryService.js";

const MAX_INJECTED_MEMORIES = 4;
const MAX_BLOCK_CHARS = 1_200;

export async function buildPersonaMessages(userId: string, customGptId?: string): Promise<ChatMessage[]> {
  const blocks: string[] = [];

  if (customGptId) {
    const { doc, public: gpt } = await getAccessibleGpt(userId, customGptId, true);
    const gptLines = [`You are ${gpt.name}.`];
    if (doc.instructions?.trim()) gptLines.push(doc.instructions.trim());
    if (gpt.description) gptLines.push(`Description: ${gpt.description}`);
    const knowledgeIds = (doc.knowledgeFileIds ?? []).map((id) => String(id));
    if (knowledgeIds.length > 0) {
      const files = await loadOwnedFiles(String(doc.creatorId), knowledgeIds);
      if (files.length > 0) {
        const materialized = await materializeFilesForModel(files);
        if (materialized.contentSuffix) {
          gptLines.push(`Knowledge files:\n${clip(materialized.contentSuffix, MAX_BLOCK_CHARS)}`);
        }
      }
    }
    blocks.push(gptLines.join("\n\n"));
  }

  const instructions = await getInstructions(userId);
  const instructionLines: string[] = [];
  if (instructions.aboutUser.trim()) {
    instructionLines.push(`About the user:\n${clip(instructions.aboutUser.trim(), MAX_BLOCK_CHARS)}`);
  }
  if (instructions.howToRespond.trim()) {
    instructionLines.push(`How to respond:\n${clip(instructions.howToRespond.trim(), MAX_BLOCK_CHARS)}`);
  }
  if (instructions.additional.trim()) {
    instructionLines.push(clip(instructions.additional.trim(), MAX_BLOCK_CHARS));
  }
  if (instructionLines.length > 0) {
    blocks.push(`Custom user instructions:\n\n${instructionLines.join("\n\n")}`);
  }

  const memories = await listMemories(userId, MAX_INJECTED_MEMORIES);
  if (memories.length > 0) {
    const lines = memories.map((memory) => `- ${clip(memory.content, 280)}`);
    blocks.push(
      `Known facts about the user. Use them when relevant; do not invent additional memories.\n${lines.join("\n")}`,
    );
  }

  return blocks.map((content) => ({ role: "system" as const, content }));
}

function clip(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[truncated]`;
}
