import mongoose from "mongoose";
import { applyJsonTransform } from "./applyJsonTransform.js";

const attachmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: "File", required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
  },
  { timestamps: true },
);

attachmentSchema.index({ conversationId: 1, createdAt: 1 });
attachmentSchema.index({ messageId: 1 });
attachmentSchema.index({ fileId: 1 });

applyJsonTransform(attachmentSchema);

export const Attachment = mongoose.model("Attachment", attachmentSchema);
