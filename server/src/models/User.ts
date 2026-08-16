import mongoose from "mongoose";
import { USER_ROLES } from "@aether/shared";
import { applyJsonTransform } from "./applyJsonTransform.js";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 320 },
    passwordHash: { type: String, select: false },
    googleId: { type: String, trim: true },
    avatar: { type: String, trim: true },
    role: { type: String, enum: USER_ROLES, default: "user", required: true },
    preferences: {
      theme: { type: String, enum: ["light", "dark", "system"], default: "system" },
      language: { type: String, default: "en", trim: true },
      sendOnEnter: { type: Boolean, default: true },
    },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });

applyJsonTransform(userSchema, ["passwordHash"]);

export const User = mongoose.model("User", userSchema);
