import mongoose from "mongoose";

// These tombstones intentionally survive deletion of their former owner's rows.
const schema = new mongoose.Schema({
  provider: { type: String, enum: ["local", "s3", "r2", "cloudinary"], required: true },
  key: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseUntil: { type: Date, default: () => new Date(0) },
  leaseToken: { type: String },
  lastErrorCode: { type: String },
}, { timestamps: true, collection: "storageDeletions" });
schema.index({ provider: 1, key: 1 }, { unique: true });
schema.index({ nextAttemptAt: 1, leaseUntil: 1 });
export const StorageDeletion = mongoose.model("StorageDeletion", schema);
