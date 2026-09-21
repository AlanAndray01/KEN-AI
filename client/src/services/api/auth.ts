import type { AuthResponse, OkResponse, VerificationRequiredResponse } from "./types";
import { apiBaseUrl, request } from "./client";

export const authApi = {
  register: (body: { name: string; email: string; password: string }) =>
    request<VerificationRequiredResponse>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  verifyEmail: (body: { email: string; code: string }) =>
    request<AuthResponse>("/auth/verify-email", { method: "POST", body: JSON.stringify(body) }),
  resendCode: (body: { email: string }) =>
    request<OkResponse>("/auth/resend-code", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<OkResponse>("/auth/logout", { method: "POST" }),
  refresh: () => request<AuthResponse>("/auth/refresh", { method: "POST" }),
  me: () => request<AuthResponse>("/auth/me"),
  forgotPassword: (body: { email: string }) =>
    request<OkResponse>("/auth/forgot-password", { method: "POST", body: JSON.stringify(body) }),
  resetPassword: (body: { email: string; password: string; token?: string; code?: string }) =>
    request<OkResponse>("/auth/reset-password", { method: "POST", body: JSON.stringify(body) }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<OkResponse>("/auth/change-password", { method: "POST", body: JSON.stringify(body) }),
  googleStartUrl: `${apiBaseUrl}/auth/google`,
};
