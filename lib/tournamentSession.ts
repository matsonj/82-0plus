// Client-side "remember me" for the tournament's old-school auth. After a
// successful submit or lookup we stash the player's username + PIN in
// localStorage so they stay logged in — they only need a team name to enter
// another team, and can log out to clear it. This is a cheeky arcade lock, not
// real auth (same spirit as the PIN itself), so plain localStorage is fine; it's
// never sent automatically over the wire the way a cookie would be.

const KEY = "md820-tournament-user";

export interface SavedUser {
  username: string;
  pin: string;
}

/** The logged-in player, or null. Safe on the server (returns null). */
export function getSavedUser(): SavedUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedUser>;
    if (typeof parsed?.username === "string" && typeof parsed?.pin === "string") {
      return { username: parsed.username, pin: parsed.pin };
    }
  } catch {
    /* localStorage unavailable / malformed */
  }
  return null;
}

export function saveUser(user: SavedUser): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

export function clearUser(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
