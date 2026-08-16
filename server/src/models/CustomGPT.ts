import mongoose from "mongoose";
import { GPT_CATEGORIES, GPT_VISIBILITY, MODEL_CAPABILITIES } from "@aether/shared";
import { applyJsonTransform } from "./applyJsonTransform.js";

const customGptSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 2000 },
    avatar: { type: String, trim: true },
    instructions: { type: String, default: "", maxlength: 32_000 },
    conversationStarters: [{ type: String, trim: true, maxlength: 280 }],
    knowledgeFileIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "File" }],
    capabilities: [{ type: String, enum: MODEL_CAPABILITIES }],
    modelId: { type: String, trim: true },
    providerId: { type: String, trim: true },
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    visibility: { type: String, enum: GPT_VISIBILITY, default: "private", required: true },
    category: { type: String, enum: GPT_CATEGORIES, default: "other", required: true },
  },
  { timestamps: true, collection: "custom_gpts" },
);

customGptSchema.index({ creatorId: 1, updatedAt: -1 });
customGptSchema.index({ visibility: 1, category: 1, updatedAt: -1 });
customGptSchema.index({ name: "text", description: "text" });

applyJsonTransform(customGptSchema);

export const CustomGPT = mongoose.model("CustomGPT", customGptSchema);
