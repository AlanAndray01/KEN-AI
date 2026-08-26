import mongoose from "mongoose";
import { MESSAGE_ROLES } from "@Ken/shared";
import { applyJsonTransform } from "./applyJsonTransform.js";

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: MESSAGE_ROLES, required: true },
    content: { type: String, default: "" },
    attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Attachment" }],
    model: { type: String, trim: true },
    provider: { type: String, trim: true },
    toolCalls: { type: mongoose.Schema.Types.Mixed },
    citations: { type: mongoose.Schema.Types.Mixed },
    parentMessageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    status: {
      type: String,
      enum: ["streaming", "complete", "aborted", "error"],
      default: "complete",
      required: true,
    },
    generationId: { type: String, trim: true },
    feedback: {
      rating: { type: String, enum: ["up", "down"] },
      comment: { type: String, maxlength: 2000 },
    },
    metadata: { type: mongoose.Schema.Types.Mixed },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ userId: 1, conversationId: 1 });
messageSchema.index({ createdAt: -1 });
messageSchema.index({ generationId: 1 });
messageSchema.index({ content: "text" });
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

applyJsonTransform(messageSchema);

export const Message = mongoose.model("Message", messageSchema);
