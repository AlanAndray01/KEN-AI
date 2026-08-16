import type { Request } from "express";
import type { PublicUser, ThemePreference } from "@aether/shared";
import { env } from "../../config/env.js";
import { PasswordReset } from "../../models/PasswordReset.js";
import { User } from "../../models/User.js";
import { AppError } from "../../utils/AppError.js";
import { generateUrlToken, hashPassword, hashToken, verifyPassword } from "./crypto.js";
import { sendPasswordResetEmail } from "./emailService.js";
import type { GoogleProfile } from "./googleAuthService.js";
import {
  createSession,
  findActiveSessionById,
  findActiveSessionByRefreshToken,
  revokeSession,
  revokeUserSessions,
} from "./sessionService.js";
import { signAccessToken } from "./tokens.js";
import { resolveSignupRole, toPublicUser } from "./toPublicUser.js";

interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

function duplicateEmailError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000,
  );
}

export async function registerUser(
  input: { name: string; email: string; password: string },
  req: Request,
): Promise<AuthResult> {
  const email = input.email.toLowerCase();
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await User.create({
      name: input.name,
      email,
      passwordHash,
      role: resolveSignupRole(email),
    });
    return issueAuth(String(user._id), req);
  } catch (error) {
    if (duplicateEmailError(error)) {
      throw new AppError("An account with this email already exists", {
        statusCode: 409,
        code: "EMAIL_TAKEN",
      });
    }
    throw error;
  }
}

export async function loginUser(
  input: { email: string; password: string },
  req: Request,
): Promise<AuthResult> {
  const user = await User.findOne({ email: input.email.toLowerCase() }).select("+passwordHash");
  if (!user?.passwordHash) {
    throw new AppError("Invalid email or password", {
      statusCode: 401,
      code: "INVALID_CREDENTIALS",
    });
  }

  const matches = await verifyPassword(user.passwordHash, input.password);
  if (!matches) {
    throw new AppError("Invalid email or password", {
      statusCode: 401,
      code: "INVALID_CREDENTIALS",
    });
  }

  return issueAuth(String(user._id), req);
}

export async function logoutUser(sessionId: string | undefined, refreshToken: string | undefined): Promise<void> {
  if (sessionId) {
    await revokeSession(sessionId);
    return;
  }

  if (refreshToken) {
    const session = await findActiveSessionByRefreshToken(refreshToken);
    if (session) {
      await revokeSession(String(session._id));
    }
  }
}

export async function refreshAuth(refreshToken: string, req: Request): Promise<AuthResult> {
  const session = await findActiveSessionByRefreshToken(refreshToken);
  if (!session) {
    throw new AppError("Session has expired or been revoked", {
      statusCode: 401,
      code: "SESSION_REVOKED",
    });
  }

  await revokeSession(String(session._id));
  return issueAuth(String(session.userId), req);
}

export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const user = await User.findById(userId).select("+passwordHash");
  if (!user) {
    throw new AppError("Unauthorized", { statusCode: 401, code: "UNAUTHORIZED" });
  }

  if (!user.passwordHash) {
    throw new AppError("This account uses Google sign-in. Set a password from account settings after linking.", {
      statusCode: 400,
      code: "PASSWORD_NOT_SET",
    });
  }

  const matches = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!matches) {
    throw new AppError("Current password is incorrect", {
      statusCode: 401,
      code: "INVALID_CREDENTIALS",
    });
  }

  user.passwordHash = await hashPassword(input.newPassword);
  await user.save();
  await revokeUserSessions(userId);
}

export async function forgotPassword(email: string): Promise<string | undefined> {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return undefined;
  }

  const token = generateUrlToken();
  await PasswordReset.create({
    userId: user._id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  const resetUrl = `${env.CLIENT_URL.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
  await sendPasswordResetEmail(String(user._id), resetUrl);

  return env.NODE_ENV === "test" || env.ENABLE_DEV_AUTH_TOOLS ? token : undefined;
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const reset = await PasswordReset.findOne({
    tokenHash: hashToken(token),
    usedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  }).select("+tokenHash");

  if (!reset) {
    throw new AppError("Reset link is invalid or has expired", {
      statusCode: 400,
      code: "RESET_TOKEN_INVALID",
    });
  }

  const user = await User.findById(reset.userId).select("+passwordHash");
  if (!user) {
    throw new AppError("Reset link is invalid or has expired", {
      statusCode: 400,
      code: "RESET_TOKEN_INVALID",
    });
  }

  user.passwordHash = await hashPassword(password);
  await user.save();
  reset.usedAt = new Date();
  await reset.save();
  await revokeUserSessions(String(user._id));
}

export async function loginWithGoogleProfile(profile: GoogleProfile, req: Request): Promise<AuthResult> {
  const existingGoogle = await User.findOne({ googleId: profile.googleId });
  if (existingGoogle) {
    return issueAuth(String(existingGoogle._id), req);
  }

  const existingEmail = await User.findOne({ email: profile.email });
  if (existingEmail) {
    existingEmail.googleId = profile.googleId;
    if (!existingEmail.avatar && profile.avatar) {
      existingEmail.avatar = profile.avatar;
    }
    await existingEmail.save();
    return issueAuth(String(existingEmail._id), req);
  }

  try {
    const created = await User.create({
      name: profile.name,
      email: profile.email,
      googleId: profile.googleId,
      role: resolveSignupRole(profile.email),
      ...(profile.avatar ? { avatar: profile.avatar } : {}),
    });
    return issueAuth(String(created._id), req);
  } catch (error) {
    if (duplicateEmailError(error)) {
      throw new AppError("An account with this email already exists", {
        statusCode: 409,
        code: "EMAIL_TAKEN",
      });
    }
    throw error;
  }
}

export async function getUserById(userId: string): Promise<PublicUser> {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("Unauthorized", { statusCode: 401, code: "UNAUTHORIZED" });
  }
  return toPublicUser(user);
}

export async function updateProfile(
  userId: string,
  input: {
    name?: string;
    preferences?: { theme?: ThemePreference; language?: string; sendOnEnter?: boolean };
  },
): Promise<PublicUser> {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("Unauthorized", { statusCode: 401, code: "UNAUTHORIZED" });
  }

  if (input.name) {
    user.name = input.name;
  }

  if (input.preferences) {
    const current = user.preferences ?? { theme: "system", language: "en", sendOnEnter: true };
    const theme = input.preferences.theme ?? current.theme ?? "system";
    user.preferences = {
      theme: theme === "light" || theme === "dark" || theme === "system" ? theme : "system",
      language: input.preferences.language ?? current.language ?? "en",
      sendOnEnter: input.preferences.sendOnEnter ?? current.sendOnEnter ?? true,
    };
  }

  await user.save();
  return toPublicUser(user);
}

async function issueAuth(userId: string, req: Request): Promise<AuthResult> {
  const user = await User.findByIdAndUpdate(userId, { lastLoginAt: new Date() }, { new: true });
  if (!user) {
    throw new AppError("Unauthorized", { statusCode: 401, code: "UNAUTHORIZED" });
  }

  const { sessionId, refreshToken } = await createSession(userId, req);
  const accessToken = await signAccessToken({
    sub: userId,
    sid: sessionId,
    role: user.role,
  });

  return {
    user: toPublicUser(user),
    accessToken,
    refreshToken,
  };
}

export async function assertSessionActive(sessionId: string): Promise<void> {
  const session = await findActiveSessionById(sessionId);
  if (!session) {
    throw new AppError("Session has expired or been revoked", {
      statusCode: 401,
      code: "SESSION_REVOKED",
    });
  }
}
