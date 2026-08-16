import mongoose from "mongoose";
import { applyJsonTransform } from "./applyJsonTransform.js";

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["system", "share", "export", "provider", "security"],
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    readAt: { type: Date },
    data: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true, collection: "notifications" },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });

applyJsonTransform(notificationSchema);

export const Notification = mongoose.model("Notification", notificationSchema);
