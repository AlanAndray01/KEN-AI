import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PublicUser } from "@aether/shared";
import { AuthContext, type AuthUser } from "@/contexts/auth-context";
import { ApiError, api } from "@/services/api";

function toAuthUser(user: PublicUser): AuthUser {
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

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.auth.login({ email, password });
    setUser(toAuthUser(response.user));
  }, []);

  const register = useCallback(async (input: { name: string; email: string; password: string }) => {
    const response = await api.auth.register(input);
    setUser(toAuthUser(response.user));
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
    () => ({ user, isLoading, login, register, logout, refreshUser }),
    [user, isLoading, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
