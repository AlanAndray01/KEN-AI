import { Router } from "express";
import {
  changePasswordHandler,
  forgotPasswordHandler,
  googleCallback,
  googleStart,
  googleToken,
  login,
  logout,
  me,
  refresh,
  register,
  resendCode,
  resetPasswordHandler,
  verifyEmail,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { rateLimitAuth, rateLimitPasswordReset } from "../middleware/rateLimit.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authRouter = Router();

authRouter.post("/register", rateLimitAuth, asyncHandler(register));
authRouter.post("/login", rateLimitAuth, asyncHandler(login));
authRouter.post("/verify-email", rateLimitPasswordReset, asyncHandler(verifyEmail));
authRouter.post("/resend-code", rateLimitPasswordReset, asyncHandler(resendCode));
authRouter.post("/logout", rateLimitAuth, asyncHandler(logout));
authRouter.get("/me", requireAuth, asyncHandler(me));
authRouter.post("/refresh", rateLimitAuth, asyncHandler(refresh));
authRouter.post("/forgot-password", rateLimitPasswordReset, asyncHandler(forgotPasswordHandler));
authRouter.post("/reset-password", rateLimitPasswordReset, asyncHandler(resetPasswordHandler));
authRouter.post("/change-password", requireAuth, rateLimitPasswordReset, asyncHandler(changePasswordHandler));
authRouter.get("/google", rateLimitAuth, asyncHandler(googleStart));
authRouter.get("/google/callback", rateLimitAuth, asyncHandler(googleCallback));
authRouter.post("/google", rateLimitAuth, asyncHandler(googleToken));
