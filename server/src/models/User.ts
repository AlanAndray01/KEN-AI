import mongoose from "mongoose";
import { AUTH_PROVIDERS, USER_ROLES } from "@Ken/shared";
import { applyJsonTransform } from "./applyJsonTransform.js";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 320 },
    passwordHash: { type: String, select: false },
    authProvider: { type: String, enum: AUTH_PROVIDERS, default: "local", required: true },
    googleId: { type: String, trim: true },
    avatar: { type: String, trim: true },
    role: { type: String, enum: USER_ROLES, default: "user", required: true },
    preferences: {
      theme: { type: String, enum: ["light", "dark", "system"], default: "system" },
      language: { type: String, default: "en", trim: true },
      sendOnEnter: { type: Boolean, default: true },
      selectedProviderId: { type: String, trim: true, maxlength: 64 },
      selectedModelId: { type: String, trim: true, maxlength: 160 },
    },
    lastLoginAt: { type: Date },
    // Default true so accounts created before email OTP keep working.
    // Local registration sets this to false explicitly.
    isVerified: { type: Boolean, default: true, required: true },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });

applyJsonTransform(userSchema, ["passwordHash"]);

export const User = mongoose.model("User", userSchema);
