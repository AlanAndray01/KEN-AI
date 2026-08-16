import mongoose from "mongoose";
import { applyJsonTransform } from "./applyJsonTransform.js";

const customInstructionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    aboutUser: { type: String, default: "", maxlength: 4000 },
    howToRespond: { type: String, default: "", maxlength: 4000 },
    additional: { type: String, default: "", maxlength: 4000 },
  },
  { timestamps: true, collection: "custom_instructions" },
);

customInstructionSchema.index({ userId: 1 }, { unique: true });

applyJsonTransform(customInstructionSchema);

export const CustomInstruction = mongoose.model("CustomInstruction", customInstructionSchema);
