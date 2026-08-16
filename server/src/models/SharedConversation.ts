import mongoose from "mongoose";
import { applyJsonTransform } from "./applyJsonTransform.js";

const sharedConversationSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    token: { type: String, required: true, trim: true },
    isReadOnly: { type: Boolean, default: true, required: true },
    revokedAt: { type: Date },
    expiresAt: { type: Date },
    viewCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, collection: "shared_conversations" },
);

sharedConversationSchema.index({ token: 1 }, { unique: true });
sharedConversationSchema.index({ conversationId: 1, revokedAt: 1 });
sharedConversationSchema.index({ userId: 1, createdAt: -1 });

applyJsonTransform(sharedConversationSchema);

export const SharedConversation = mongoose.model("SharedConversation", sharedConversationSchema);
