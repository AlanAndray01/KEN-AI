import mongoose from "mongoose";
import { applyJsonTransform } from "./applyJsonTransform.js";

const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    refreshTokenHash: { type: String, required: true, select: false },
    userAgent: { type: String, trim: true, maxlength: 512 },
    ipHash: { type: String, trim: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
  },
  { timestamps: true, collection: "sessions" },
);

sessionSchema.index({ userId: 1, createdAt: -1 });
sessionSchema.index({ refreshTokenHash: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

applyJsonTransform(sessionSchema, ["refreshTokenHash"]);

export const Session = mongoose.model("Session", sessionSchema);
