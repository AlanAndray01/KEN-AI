import type { Request, Response } from "express";
import { patchMeSchema, type ThemePreference } from "@aether/shared";
import { AppError } from "../utils/AppError.js";
import { updateProfile } from "../services/auth/authService.js";

export async function updateMeHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    throw new AppError("Authentication required", { statusCode: 401, code: "UNAUTHORIZED" });
  }
  const body = patchMeSchema.parse(req.body);
  const input: {
    name?: string;
    preferences?: { theme?: ThemePreference; language?: string; sendOnEnter?: boolean };
  } = {};
  if (body.name !== undefined) input.name = body.name;
  if (body.preferences !== undefined) {
    const preferences: { theme?: ThemePreference; language?: string; sendOnEnter?: boolean } = {};
    if (body.preferences.theme !== undefined) preferences.theme = body.preferences.theme;
    if (body.preferences.language !== undefined) preferences.language = body.preferences.language;
    if (body.preferences.sendOnEnter !== undefined) preferences.sendOnEnter = body.preferences.sendOnEnter;
    input.preferences = preferences;
  }
  const user = await updateProfile(req.auth.userId, input);
  res.status(200).json({ user });
}
