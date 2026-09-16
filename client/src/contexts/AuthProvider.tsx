import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PublicUser } from "@Ken/shared";
import { AuthContext, type AuthUser } from "@/contexts/auth-context";
import { prefetchSignedInWorkspace } from "@/query";
import { ApiError, api, onUnauthorized } from "@/services/api";
import { hydrateModelSelection } from "@/stores/modelStore";
import { readCachedAuthUser, writeCachedAuthUser } from "@/utils/authCache";

function toAuthUser(user: PublicUser): AuthUser {
  hydrateModelSelection(user.preferences);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    preferences: user.preferences,
    // Present for Google sign-in; the delete-account form uses it to decide
    // whether to ask for a password the account may not have.
    ...(user.googleId ? { googleId: user.googleId } : {}),
  };
}

function hydrateFromCache(): AuthUser | null {
  const cached = readCachedAuthUser();
  if (!cached) return null;
  hydrateModelSelection(cached.preferences);
  return cached;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(hydrateFromCache);
  const [isLoading, setIsLoading] = useState(() => !readCachedAuthUser());

  useEffect(() => {
    if (!user) return;
    prefetchSignedInWorkspace(queryClient);
  }, [queryClient, user]);

  const commitUser = useCallback((next: AuthUser | null) => {
    writeCachedAuthUser(next);
    setUser(next);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void api.auth
      .me()
      .then((response) => {
        if (!cancelled) {
          commitUser(toAuthUser(response.user));
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (
          error instanceof ApiError &&
          (error.status === 401 || error.code === "EMAIL_NOT_VERIFIED")
        ) {
          commitUser(null);
          return;
        }
        // Network / 5xx: keep a cached session so `/chat` still paints.
        // A real logout is only a 401 (or the explicit logout path).
        if (!readCachedAuthUser()) {
          commitUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [commitUser]);

  // The API client rotates an expired access token automatically; this fires
  // only when the refresh token is gone too, so the session is truly over.
  useEffect(() => onUnauthorized(() => commitUser(null)), [commitUser]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await api.auth.login({ email, password });
      commitUser(toAuthUser(response.user));
      return undefined;
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === "EMAIL_NOT_VERIFIED") {
        return {
          requiresVerification: true as const,
          email: error.email ?? email,
          ...(error.emailSent !== undefined ? { emailSent: error.emailSent } : {}),
        };
      }
      throw error;
    }
  }, [commitUser]);

  const register = useCallback(async (input: { name: string; email: string; password: string }) => {
    const response = await api.auth.register(input);
    return {
      requiresVerification: true as const,
      email: response.email,
      emailSent: response.emailSent,
    };
  }, []);

  const verifyEmail = useCallback(async (email: string, code: string) => {
    const response = await api.auth.verifyEmail({ email, code });
    commitUser(toAuthUser(response.user));
  }, [commitUser]);

  const resendCode = useCallback(async (email: string) => {
    await api.auth.resendCode({ email });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      commitUser(null);
    }
  }, [commitUser]);

  const refreshUser = useCallback(async () => {
    const response = await api.auth.me();
    commitUser(toAuthUser(response.user));
  }, [commitUser]);

  const value = useMemo(
    () => ({ user, isLoading, login, register, verifyEmail, resendCode, logout, refreshUser }),
    [user, isLoading, login, register, verifyEmail, resendCode, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
