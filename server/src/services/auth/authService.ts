import type { Request } from "express";
import type { PublicUser, ThemePreference } from "@Ken/shared";
import { env } from "../../config/env.js";
import { PasswordReset } from "../../models/PasswordReset.js";
import { User } from "../../models/User.js";
import { VerificationToken } from "../../models/VerificationToken.js";
import { AppError } from "../../utils/AppError.js";
import { generateNumericCode, hashPassword, hashesMatch, hashToken, verifyPassword } from "./crypto.js";
import { assertLoginNotLocked, recordFailedLogin } from "./loginLockout.js";
import {
  deliverPasswordResetEmail,
  deliverVerificationEmail,
  emailUnavailableError,
  isEmailConfigured,
} from "./emailService.js";
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

const VERIFICATION_TTL_MS = 15 * 60 * 1000;

interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

export interface PendingVerification {
  success: true;
  message: string;
  requiresVerification: true;
  email: string;
  emailSent: boolean;
  verificationCode?: string;
}

function duplicateEmailError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000,
  );
}

function isUnverified(user: { isVerified?: boolean | null }): boolean {
  return user.isVerified === false;
}

function maybeRevealCode(code: string): string | undefined {
  if (env.NODE_ENV === "production") return undefined;
  return env.NODE_ENV === "test" || env.ENABLE_DEV_AUTH_TOOLS ? code : undefined;
}

function pendingVerification(email: string, emailSent: boolean, code: string): PendingVerification {
  const verificationCode = maybeRevealCode(code);
  return {
    success: true,
    message: "Verification code sent (check console during dev).",
    requiresVerification: true,
    email,
    emailSent,
    ...(verificationCode ? { verificationCode } : {}),
  };
}

async function issueVerificationCode(userId: string, email: string): Promise<PendingVerification> {
  const code = generateNumericCode(6);
  await VerificationToken.deleteMany({ userId });
  await VerificationToken.create({
    userId,
    codeHash: hashToken(code),
    expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
  });
  const emailSent = await deliverVerificationEmail(email, code);
  return pendingVerification(email, emailSent, code);
}

export async function registerUser(
  input: { name: string; email: string; password: string },
): Promise<PendingVerification> {
  if (env.NODE_ENV === "production" && !isEmailConfigured()) {
    throw emailUnavailableError();
  }

  const email = input.email.toLowerCase();
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await User.create({
      name: input.name,
      email,
      passwordHash,
      authProvider: "local",
      isVerified: false,
      role: resolveSignupRole(email),
    });
    return issueVerificationCode(String(user._id), email);
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
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  assertLoginNotLocked(ip);

  const user = await User.findOne({ email: input.email.toLowerCase() }).select("+passwordHash");
  if (!user?.passwordHash) {
    recordFailedLogin(ip);
    throw new AppError("Invalid email or password", {
      statusCode: 401,
      code: "INVALID_CREDENTIALS",
    });
  }

  const matches = await verifyPassword(user.passwordHash, input.password);
  if (!matches) {
    recordFailedLogin(ip);
    throw new AppError("Invalid email or password", {
      statusCode: 401,
      code: "INVALID_CREDENTIALS",
    });
  }

  if (isUnverified(user)) {
    const pending = await issueVerificationCode(String(user._id), user.email);
    throw new AppError("Verify your email before signing in", {
      statusCode: 403,
      code: "EMAIL_NOT_VERIFIED",
      extra: { ...pending },
    });
  }

  return issueAuth(String(user._id), req);
}

export async function verifyEmailCode(
  input: { email: string; code: string },
  req: Request,
): Promise<AuthResult> {
  const email = input.email.toLowerCase();
  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError("Invalid or expired verification code", {
      statusCode: 400,
      code: "INVALID_VERIFICATION_CODE",
    });
  }

  if (!isUnverified(user)) {
    throw new AppError("This email is already verified. Sign in instead.", {
      statusCode: 400,
      code: "EMAIL_ALREADY_VERIFIED",
    });
  }

  const token = await VerificationToken.findOne({
    userId: user._id,
    expiresAt: { $gt: new Date() },
  }).select("+codeHash");

  if (!token?.codeHash || !hashesMatch(token.codeHash, hashToken(input.code))) {
    throw new AppError("Invalid or expired verification code", {
      statusCode: 400,
      code: "INVALID_VERIFICATION_CODE",
    });
  }

  user.isVerified = true;
  await user.save();
  await VerificationToken.deleteMany({ userId: user._id });
  return issueAuth(String(user._id), req);
}

export async function resendVerificationCode(email: string): Promise<{ ok: true }> {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (user && isUnverified(user)) {
    await issueVerificationCode(String(user._id), user.email);
  }
  return { ok: true };
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

  const code = generateNumericCode(6);
  await PasswordReset.deleteMany({ userId: user._id, usedAt: { $exists: false } });
  await PasswordReset.create({
    userId: user._id,
    tokenHash: hashToken(code),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });

  await deliverPasswordResetEmail(user.email, code);
  return maybeRevealCode(code);
}

export async function resetPassword(input: {
  email?: string;
  password: string;
  token?: string;
  code?: string;
}): Promise<void> {
  const secret = input.code ?? input.token ?? "";
  const email = input.email?.trim().toLowerCase();
  if (!secret) {
    throw new AppError("Reset code is invalid or has expired", {
      statusCode: 400,
      code: "RESET_TOKEN_INVALID",
    });
  }

  const user = email ? await User.findOne({ email }).select("+passwordHash") : null;
  const reset = await PasswordReset.findOne({
    tokenHash: hashToken(secret),
    usedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
    ...(user ? { userId: user._id } : {}),
  }).select("+tokenHash");

  if (!reset) {
    throw new AppError("Reset code is invalid or has expired", {
      statusCode: 400,
      code: "RESET_TOKEN_INVALID",
    });
  }

  const account = user ?? (await User.findById(reset.userId).select("+passwordHash"));
  if (!account) {
    throw new AppError("Reset code is invalid or has expired", {
      statusCode: 400,
      code: "RESET_TOKEN_INVALID",
    });
  }

  account.passwordHash = await hashPassword(input.password);
  account.authProvider = "local";
  // The inbox code is proof of address ownership, same as email OTP.
  account.isVerified = true;
  await account.save();
  reset.usedAt = new Date();
  await reset.save();
  await revokeUserSessions(String(account._id));
}

export async function loginWithGoogleProfile(profile: GoogleProfile, req: Request): Promise<AuthResult> {
  const existingGoogle = await User.findOne({ googleId: profile.googleId });
  if (existingGoogle) {
    return issueAuth(String(existingGoogle._id), req);
  }

  const existingEmail = await User.findOne({ email: profile.email });
  if (existingEmail) {
    existingEmail.googleId = profile.googleId;
    existingEmail.isVerified = true;
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
      authProvider: "google",
      isVerified: true,
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
  if (isUnverified(user)) {
    throw new AppError("Verify your email before signing in", {
      statusCode: 403,
      code: "EMAIL_NOT_VERIFIED",
      extra: { requiresVerification: true, email: user.email },
    });
  }
  return toPublicUser(user);
}

export async function updateProfile(
  userId: string,
  input: {
    name?: string;
    preferences?: {
      theme?: ThemePreference;
      language?: string;
      sendOnEnter?: boolean;
      selectedProviderId?: string;
      selectedModelId?: string;
      selectionMode?: "auto" | "manual";
    };
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
    const current = user.preferences ?? { theme: "system", language: "en", sendOnEnter: false };
    const theme = input.preferences.theme ?? current.theme ?? "system";
    const selectedProviderId = input.preferences.selectedProviderId ?? current.selectedProviderId;
    const selectedModelId = input.preferences.selectedModelId ?? current.selectedModelId;
    const selectionMode = input.preferences.selectionMode ?? current.selectionMode;
    user.preferences = {
      theme: theme === "light" || theme === "dark" || theme === "system" ? theme : "system",
      language: input.preferences.language ?? current.language ?? "en",
      sendOnEnter: input.preferences.sendOnEnter ?? current.sendOnEnter ?? false,
      ...(selectedProviderId ? { selectedProviderId } : {}),
      ...(selectedModelId ? { selectedModelId } : {}),
      ...(selectionMode ? { selectionMode } : {}),
    };
  }

  await user.save();
  return toPublicUser(user);
}

async function issueAuth(userId: string, req: Request): Promise<AuthResult> {
  const user = await User.findByIdAndUpdate(userId, { lastLoginAt: new Date() }, { returnDocument: "after" });
  if (!user) {
    throw new AppError("Unauthorized", { statusCode: 401, code: "UNAUTHORIZED" });
  }

  if (isUnverified(user)) {
    throw new AppError("Verify your email before signing in", {
      statusCode: 403,
      code: "EMAIL_NOT_VERIFIED",
      extra: { requiresVerification: true, email: user.email },
    });
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
