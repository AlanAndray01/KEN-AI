import { createContext } from "react";
import type { PublicUser } from "@Ken/shared";

export type AuthUser = Pick<PublicUser, "id" | "name" | "email" | "role" | "preferences" | "googleId">;

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<
    { requiresVerification: true; email: string; emailSent?: boolean } | void
  >;
  register: (input: { name: string; email: string; password: string }) => Promise<{
    requiresVerification: true;
    email: string;
    emailSent: boolean;
  }>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendCode: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  login: async () => undefined,
  register: async () => ({ requiresVerification: true, email: "", emailSent: false }),
  verifyEmail: async () => undefined,
  resendCode: async () => undefined,
  logout: async () => undefined,
  refreshUser: async () => undefined,
});
