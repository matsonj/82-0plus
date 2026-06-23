// Client-side "remember me" for the tournament's old-school auth. After a
// successful submit or lookup we stash the player's username + PIN in
// localStorage so they stay logged in — they only need a team name to enter
// another team, and can log out to clear it. This is a cheeky arcade lock, not
// real auth (same spirit as the PIN itself), so plain localStorage is fine; it's
// never sent automatically over the wire the way a cookie would be.

const KEY = "md820-tournament-user";

// Same-tab login/logout doesn't fire the `storage` event (that's cross-tab
// only), so the masthead can't otherwise tell when the session changed without
// a reload. saveUser/clearUser broadcast this event; subscribeSession lets the
// header (or anyone) re-read getSavedUser() the instant it does.
const SESSION_EVENT = "md820-session-change";

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
  notifySessionChange();
}

export function clearUser(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  notifySessionChange();
}

function notifySessionChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

/**
 * Run `onChange` whenever the saved session changes — both same-tab
 * login/logout (via SESSION_EVENT) and cross-tab changes (via `storage`).
 * Returns an unsubscribe fn. No-op / returns a no-op on the server.
 */
export function subscribeSession(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    // key === null fires on storage.clear(); treat that as a session change too.
    if (e.key === KEY || e.key === null) onChange();
  };
  window.addEventListener(SESSION_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SESSION_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
