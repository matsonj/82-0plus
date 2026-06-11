// Client-only, in-memory (module singleton) cache of a signed-in account's daily
// completion map + today's rank. It survives client-side route navigation — which
// unmounts and remounts the homepage (e.g. Home → /tournament → Home) — but NOT a
// full page reload. That's exactly the lifetime stale-while-revalidate wants: on a
// remount we paint the last-known results immediately and refetch in the
// background, instead of flashing the loading skeleton. A genuine cold load (empty
// cache) still shows the skeleton until the first /api/daily/results fetch lands.
//
// Keyed by username so switching accounts never paints the wrong results. The
// server (/api/daily/results, a credentialed POST) remains the source of truth;
// this is only a render hint that avoids the foreground flash between navigations.
//
// Why a module singleton and not the Next router cache: the router cache preserves
// RSC payloads per route, not a client component's useState across unmount, and
// this data comes from a client fetch — so the value must live outside the
// component to bridge the remount.

export interface DailyResultEntry {
  wins: number;
  losses: number;
  margin: number;
  perfect: boolean;
}

export type DailyDoneMap = Record<string, DailyResultEntry>;

export interface DailyRank {
  rank: number;
  total: number;
}

export interface CachedDailyResults {
  done: DailyDoneMap;
  rank: DailyRank | null;
}

const cache = new Map<string, CachedDailyResults>();

// Account identity is (name, PIN), not the name alone — the same name with a
// different PIN is a DIFFERENT account. Key on both so one account can never paint
// another same-name account's cached results. JSON.stringify keeps the two fields
// unambiguous (no delimiter a name or PIN could forge).
function accountKey(username: string, pin: string): string {
  return JSON.stringify([username, pin]);
}

export function getCachedDailyResults(
  username: string,
  pin: string,
): CachedDailyResults | null {
  return cache.get(accountKey(username, pin)) ?? null;
}

export function setCachedDailyResults(
  username: string,
  pin: string,
  done: DailyDoneMap,
  rank: DailyRank | null,
): void {
  cache.set(accountKey(username, pin), { done, rank });
}
