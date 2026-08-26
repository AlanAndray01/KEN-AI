import mongoose from "mongoose";
import { applyJsonTransform } from "./applyJsonTransform.js";

const verificationTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    codeHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "verification_tokens" },
);

verificationTokenSchema.index({ userId: 1 });
verificationTokenSchema.index({ codeHash: 1 });
verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

applyJsonTransform(verificationTokenSchema, ["codeHash"]);

export const VerificationToken = mongoose.model("VerificationToken", verificationTokenSchema);
