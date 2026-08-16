import type { PublicUser, UserRole } from "@aether/shared";
import { env } from "../../config/env.js";

interface UserLike {
  _id: { toString(): string };
  name: string;
  email: string;
  googleId?: string | null;
  avatar?: string | null;
  role: UserRole;
  preferences?: {
    theme?: string;
    language?: string;
    sendOnEnter?: boolean;
  } | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date | null;
}

export function toPublicUser(user: UserLike): PublicUser {
  const theme = user.preferences?.theme;
  const publicUser: PublicUser = {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    preferences: {
      theme: theme === "light" || theme === "dark" || theme === "system" ? theme : "system",
      language: user.preferences?.language ?? "en",
      sendOnEnter: user.preferences?.sendOnEnter ?? true,
    },
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };

  if (user.googleId) {
    publicUser.googleId = user.googleId;
  }
  if (user.avatar) {
    publicUser.avatar = user.avatar;
  }
  if (user.lastLoginAt) {
    publicUser.lastLoginAt = user.lastLoginAt.toISOString();
  }

  return publicUser;
}

export function resolveSignupRole(email: string): UserRole {
  const adminEmail = env.INITIAL_ADMIN_EMAIL?.toLowerCase();
  return adminEmail && adminEmail === email.toLowerCase() ? "admin" : "user";
}
