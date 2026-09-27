import mongoose from "mongoose";
import { applyJsonTransform } from "./applyJsonTransform.js";

const storedFileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    originalName: { type: String, required: true, trim: true, maxlength: 512 },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, required: true, min: 0 },
    storageProvider: {
      type: String,
      enum: ["local", "s3", "r2", "cloudinary"],
      default: "local",
      required: true,
    },
    storageKey: { type: String, required: true, trim: true },
    checksum: { type: String, trim: true },
    kind: { type: String, enum: ["image", "document", "audio", "other"], default: "other" },
    status: {
      type: String,
      enum: ["uploaded", "processing", "ready", "failed"],
      default: "uploaded",
    },
    metadata: { type: mongoose.Schema.Types.Mixed },
    /**
     * The document's extracted text, split into sections for section search.
     * Built the first time the file is sent to a model and reused after that,
     * so a follow-up question never re-downloads and re-parses the file.
     * Empty for a document with no extractable text (a scanned PDF).
     */
    textSections: { type: [String], default: undefined },
    /** Which splitter built textSections, so a change to it rebuilds them. */
    textSectionsVersion: { type: Number },
  },
  { timestamps: true, collection: "files" },
);

storedFileSchema.index({ userId: 1, createdAt: -1 });
storedFileSchema.index({ storageKey: 1 }, { unique: true });

applyJsonTransform(storedFileSchema);

export const File = mongoose.model("File", storedFileSchema);
