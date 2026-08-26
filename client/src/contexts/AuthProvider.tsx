import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PublicUser } from "@aether/shared";
import { AuthContext, type AuthUser } from "@/contexts/auth-context";
import { ApiError, api, onUnauthorized } from "@/services/api";
import { hydrateModelSelection } from "@/stores/modelStore";

function toAuthUser(user: PublicUser): AuthUser {
  hydrateModelSelection(user.preferences.selectedProviderId, user.preferences.selectedModelId);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    preferences: user.preferences,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void api.auth
      .me()
      .then((response) => {
        if (!cancelled) {
          setUser(toAuthUser(response.user));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled && error instanceof ApiError && error.status === 401) {
          setUser(null);
          return;
        }
        if (!cancelled) {
          setUser(null);
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
  }, []);

  // The API client rotates an expired access token automatically; this fires
  // only when the refresh token is gone too, so the session is truly over.
  useEffect(() => onUnauthorized(() => setUser(null)), []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await api.auth.login({ email, password });
      setUser(toAuthUser(response.user));
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
  }, []);

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
    setUser(toAuthUser(response.user));
  }, []);

  const resendCode = useCallback(async (email: string) => {
    await api.auth.resendCode({ email });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const response = await api.auth.me();
    setUser(toAuthUser(response.user));
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, register, verifyEmail, resendCode, logout, refreshUser }),
    [user, isLoading, login, register, verifyEmail, resendCode, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
