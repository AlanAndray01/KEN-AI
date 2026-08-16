import mongoose from "mongoose";
import { applyJsonTransform } from "./applyJsonTransform.js";

const passwordResetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: true, collection: "password_resets" },
);

passwordResetSchema.index({ tokenHash: 1 }, { unique: true });
passwordResetSchema.index({ userId: 1, createdAt: -1 });
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

applyJsonTransform(passwordResetSchema, ["tokenHash"]);

export const PasswordReset = mongoose.model("PasswordReset", passwordResetSchema);
