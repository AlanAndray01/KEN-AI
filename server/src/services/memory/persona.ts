import type { ChatMessage } from "../ai/AIProvider.js";
import { getAccessibleGpt } from "../gpts/gptService.js";
import { loadOwnedFiles, materializeFilesForModel } from "../storage/fileService.js";
import { getInstructions } from "./instructionService.js";
import { listMemories } from "./memoryService.js";

const MAX_INJECTED_MEMORIES = 20;

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
          gptLines.push(`Knowledge files:\n${materialized.contentSuffix}`);
        }
      }
    }
    blocks.push(gptLines.join("\n\n"));
  }

  const instructions = await getInstructions(userId);
  const instructionLines: string[] = [];
  if (instructions.aboutUser.trim()) {
    instructionLines.push(`About the user:\n${instructions.aboutUser.trim()}`);
  }
  if (instructions.howToRespond.trim()) {
    instructionLines.push(`How to respond:\n${instructions.howToRespond.trim()}`);
  }
  if (instructions.additional.trim()) {
    instructionLines.push(instructions.additional.trim());
  }
  if (instructionLines.length > 0) {
    blocks.push(`Custom user instructions:\n\n${instructionLines.join("\n\n")}`);
  }

  const memories = await listMemories(userId, MAX_INJECTED_MEMORIES);
  if (memories.length > 0) {
    const lines = memories.map((memory) => `- ${memory.content}`);
    blocks.push(
      `Known facts about the user. Use them when relevant; do not invent additional memories.\n${lines.join("\n")}`,
    );
  }

  return blocks.map((content) => ({ role: "system" as const, content }));
}
