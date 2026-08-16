import mongoose from "mongoose";
import { MODEL_CAPABILITIES } from "@aether/shared";
import { applyJsonTransform } from "./applyJsonTransform.js";

const aiModelSchema = new mongoose.Schema(
  {
    modelId: { type: String, required: true, trim: true },
    providerId: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 2000 },
    capabilities: [{ type: String, enum: MODEL_CAPABILITIES }],
    contextWindow: { type: Number, min: 0 },
    enabled: { type: Boolean, default: true, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true, collection: "ai_models" },
);

aiModelSchema.index({ providerId: 1, modelId: 1 }, { unique: true });
aiModelSchema.index({ enabled: 1, providerId: 1 });

applyJsonTransform(aiModelSchema);

export const AIModel = mongoose.model("AIModel", aiModelSchema);
