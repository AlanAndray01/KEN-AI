import mongoose from "mongoose";
import { applyJsonTransform } from "./applyJsonTransform.js";

const memorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true, trim: true, maxlength: 4000 },
    source: { type: String, enum: ["manual", "inferred"], default: "manual", required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
  },
  { timestamps: true, collection: "memories" },
);

memorySchema.index({ userId: 1, createdAt: -1 });
memorySchema.index({ userId: 1, conversationId: 1 });

applyJsonTransform(memorySchema);

export const Memory = mongoose.model("Memory", memorySchema);
