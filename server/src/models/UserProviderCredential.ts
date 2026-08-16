import mongoose from "mongoose";
import { applyJsonTransform } from "./applyJsonTransform.js";

const userProviderCredentialSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    providerId: { type: String, required: true, trim: true, lowercase: true },
    encryptedApiKey: { type: String, select: false },
    keyLastFour: { type: String, trim: true, maxlength: 8 },
    baseUrl: { type: String, trim: true },
    enabled: { type: Boolean, default: true, required: true },
  },
  { timestamps: true, collection: "user_provider_credentials" },
);

userProviderCredentialSchema.index({ userId: 1, providerId: 1 }, { unique: true });

applyJsonTransform(userProviderCredentialSchema, ["encryptedApiKey"]);

export const UserProviderCredential = mongoose.model(
  "UserProviderCredential",
  userProviderCredentialSchema,
);
