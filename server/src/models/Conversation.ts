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
    /**
     * Rolling summary of the turns older than the recent window, sent to the
     * model in their place. Server-side only: toPublicConversation never
     * copies it, and the messages themselves are never altered.
     *
     * `throughMessageId` / `throughCreatedAt` mark the last message it covers.
     * If that message is later superseded by an edit or regenerate, the summary
     * describes a branch that no longer exists and is ignored until rebuilt.
     */
    contextSummary: {
      type: new mongoose.Schema(
        {
          text: { type: String, required: true, maxlength: 8_000 },
          throughMessageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", required: true },
          throughCreatedAt: { type: Date, required: true },
          updatedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      required: false,
    },
  },
  { timestamps: true },
);

conversationSchema.index({ userId: 1, updatedAt: -1 });
conversationSchema.index({ updatedAt: -1 });
conversationSchema.index({ title: "text" });
conversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

applyJsonTransform(conversationSchema);

export const Conversation = mongoose.model("Conversation", conversationSchema);
