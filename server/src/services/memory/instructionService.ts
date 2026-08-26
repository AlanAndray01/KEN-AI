import type { PublicCustomInstruction } from "@Ken/shared";
import { CustomInstruction } from "../../models/CustomInstruction.js";

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

export function emptyInstructions(): PublicCustomInstruction {
  return { aboutUser: "", howToRespond: "", additional: "", updatedAt: new Date(0).toISOString() };
}

export function toPublicInstruction(doc: {
  aboutUser?: string | null;
  howToRespond?: string | null;
  additional?: string | null;
  updatedAt?: Date | string;
}): PublicCustomInstruction {
  return {
    aboutUser: doc.aboutUser ?? "",
    howToRespond: doc.howToRespond ?? "",
    additional: doc.additional ?? "",
    updatedAt: iso(doc.updatedAt),
  };
}

export async function getInstructions(userId: string): Promise<PublicCustomInstruction> {
  const doc = await CustomInstruction.findOne({ userId });
  return doc ? toPublicInstruction(doc) : emptyInstructions();
}

export async function upsertInstructions(
  userId: string,
  input: { aboutUser: string; howToRespond: string; additional: string },
): Promise<PublicCustomInstruction> {
  const doc = await CustomInstruction.findOneAndUpdate(
    { userId },
    {
      $set: {
        aboutUser: input.aboutUser,
        howToRespond: input.howToRespond,
        additional: input.additional,
      },
      $setOnInsert: { userId },
    },
    { returnDocument: "after", upsert: true },
  );
  return doc ? toPublicInstruction(doc) : emptyInstructions();
}
