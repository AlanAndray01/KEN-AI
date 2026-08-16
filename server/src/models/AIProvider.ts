import mongoose from "mongoose";
import { MODEL_CAPABILITIES, PROVIDER_TYPES } from "@aether/shared";
import { applyJsonTransform } from "./applyJsonTransform.js";

const aiProviderSchema = new mongoose.Schema(
  {
    providerId: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: PROVIDER_TYPES, required: true },
    baseUrl: { type: String, trim: true },
    encryptedApiKey: { type: String, select: false },
    keyLastFour: { type: String, trim: true, maxlength: 8 },
    enabled: { type: Boolean, default: false, required: true },
    capabilities: [{ type: String, enum: MODEL_CAPABILITIES }],
    lastTestStatus: {
      type: String,
      enum: ["connected", "invalid", "unavailable", "error", "not_configured"],
    },
    lastTestedAt: { type: Date },
    lastTestMessage: { type: String, trim: true, maxlength: 200 },
    metadata: { type: mongoose.Schema.Types.Mixed },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, collection: "ai_providers" },
);

aiProviderSchema.index({ providerId: 1, ownerUserId: 1 }, { unique: true });
aiProviderSchema.index({ enabled: 1 });

applyJsonTransform(aiProviderSchema, ["encryptedApiKey"]);

export const AIProvider = mongoose.model("AIProvider", aiProviderSchema);
