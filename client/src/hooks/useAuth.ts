import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "@/contexts/auth-context";

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
