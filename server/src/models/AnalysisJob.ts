import mongoose from "mongoose";
const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  upstreamId: { type: String, required: true },
  status: { type: String, enum: ["queued", "running", "succeeded", "failed", "rejected"], required: true },
  language: { type: String, enum: ["python"], default: "python" },
  message: { type: String, maxlength: 1000, default: "Queued on the isolated runner" },
  output: { type: String, maxlength: 65536 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, collection: "analysisJobs" });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ userId: 1, createdAt: -1 });
export const AnalysisJob = mongoose.model("AnalysisJob", schema);
