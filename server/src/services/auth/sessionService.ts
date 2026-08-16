import type { Request } from "express";
import { Session } from "../../models/Session.js";
import { generateUrlToken, hashToken } from "./crypto.js";
import { refreshExpiryDate } from "./duration.js";

export async function createSession(
  userId: string,
  req: Request,
): Promise<{ sessionId: string; refreshToken: string }> {
  const refreshToken = generateUrlToken();
  const userAgent = req.get("user-agent")?.slice(0, 512);
  const session = await Session.create({
    userId,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: refreshExpiryDate(),
    ...(userAgent ? { userAgent } : {}),
    ...(req.ip ? { ipHash: hashToken(req.ip) } : {}),
  });

  return { sessionId: String(session._id), refreshToken };
}

export async function findActiveSessionByRefreshToken(refreshToken: string) {
  return Session.findOne({
    refreshTokenHash: hashToken(refreshToken),
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });
}

export async function findActiveSessionById(sessionId: string) {
  return Session.findOne({
    _id: sessionId,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });
}

export async function revokeSession(sessionId: string): Promise<void> {
  await Session.updateOne({ _id: sessionId }, { $set: { revokedAt: new Date() } });
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await Session.updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}
