import type { AuthUser } from "@/contexts/auth-context";

/**
 * Session hint only — never tokens or cookies.
 *
 * `/api/auth/me` is a waterfall in front of `/chat`: ProtectedRoute waits on it
 * before painting the workspace. Remembering the last public user in
 * sessionStorage lets that route render on the first frame of a repeat visit
 * while `/me` confirms in the background. A 401 still clears the hint and
 * sends the visitor to sign-in.
 */
const KEY = "Ken.authUser";

export function readCachedAuthUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed?.id || !parsed.email || !parsed.preferences) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedAuthUser(user: AuthUser | null): void {
  try {
    if (!user) {
      sessionStorage.removeItem(KEY);
      return;
    }
    sessionStorage.setItem(KEY, JSON.stringify(user));
  } catch {
    // Private mode / quota. The next visit simply waits on `/me` again.
  }
}
