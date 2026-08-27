import mongoose from "mongoose";
import { applyJsonTransform } from "./applyJsonTransform.js";

const conversationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 200, default: "New chat" },
    /**
     * Who wrote the title. "auto" is the keyword placeholder taken from the
     * first message and is the only state the model is allowed to overwrite;
     * "user" means someone renamed the chat by hand and it must be left alone.
     */
    titleSource: {
      type: String,
      enum: ["auto", "model", "user"],
      default: "auto",
      required: true,
    },
    modelId: { type: String, required: true, trim: true },
    providerId: { type: String, required: true, trim: true },
    customGptId: { type: mongoose.Schema.Types.ObjectId, ref: "CustomGPT" },
    archived: { type: Boolean, default: false, required: true },
    pinned: { type: Boolean, default: false },
    lastMessageAt: { type: Date },
    lastMessagePreview: { type: String, maxlength: 280 },
    messageCount: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

conversationSchema.index({ userId: 1, updatedAt: -1 });
conversationSchema.index({ updatedAt: -1 });
conversationSchema.index({ title: "text" });
conversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

applyJsonTransform(conversationSchema);

export const Conversation = mongoose.model("Conversation", conversationSchema);
