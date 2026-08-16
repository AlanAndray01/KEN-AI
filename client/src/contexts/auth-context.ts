import { createContext } from "react";
import type { PublicUser } from "@aether/shared";

export type AuthUser = Pick<PublicUser, "id" | "name" | "email" | "role" | "preferences">;

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  login: async () => undefined,
  register: async () => undefined,
  logout: async () => undefined,
  refreshUser: async () => undefined,
});
