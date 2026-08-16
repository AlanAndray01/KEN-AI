import mongoose from "mongoose";
import { applyJsonTransform } from "./applyJsonTransform.js";

const usageRecordSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
    providerId: { type: String, required: true, trim: true },
    modelId: { type: String, required: true, trim: true },
    requestCount: { type: Number, default: 1, min: 0 },
    inputTokens: { type: Number, min: 0 },
    outputTokens: { type: Number, min: 0 },
    durationMs: { type: Number, min: 0 },
    success: { type: Boolean, default: true, required: true },
    errorCode: { type: String, trim: true },
    route: { type: String, trim: true },
  },
  { timestamps: true, collection: "usage_records" },
);

usageRecordSchema.index({ userId: 1, createdAt: -1 });
usageRecordSchema.index({ conversationId: 1, createdAt: -1 });
usageRecordSchema.index({ providerId: 1, createdAt: -1 });
usageRecordSchema.index({ createdAt: -1 });

applyJsonTransform(usageRecordSchema);

export const UsageRecord = mongoose.model("UsageRecord", usageRecordSchema);
