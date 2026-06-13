// Client-only, in-memory (module singleton) cache of a signed-in account's daily
// completion map. It survives client-side route navigation — which unmounts and
// remounts the homepage (e.g. Home → /tournament → Home) — but NOT a full page
// reload. That's exactly the lifetime stale-while-revalidate wants: on a remount we
// paint the last-known record immediately and refetch in the background, instead of
// flashing the loading skeleton. A genuine cold load (empty cache) still shows the
// skeleton until the first /api/daily/results fetch lands.
//
// We cache ONLY the completion record (W–L–margin per played day), which is
// immutable once a day is played. Today's RANK is deliberately NOT cached: it
// moves as other players finish, so it must come fresh from the server on every
// load rather than be painted from a stale snapshot. The page seeds the record
// from here and lets the background fetch populate the rank.
//
// Keyed by accountTag (normalized name + PIN) so switching accounts never paints
// the wrong results. The server (/api/daily/results, a credentialed POST) remains
// the source of truth; this is only a render hint that avoids the foreground flash
// between navigations.
//
// Why a module singleton and not the Next router cache: the router cache preserves
// RSC payloads per route, not a client component's useState across unmount, and
// this data comes from a client fetch — so the value must live outside the
// component to bridge the remount.

import { accountTag } from "@/lib/dailyPending";

export interface DailyResultEntry {
  wins: number;
  losses: number;
  margin: number;
  perfect: boolean;
  /** Won that day's daily tournament bracket → double ring on the scorecard. */
  champion?: boolean;
  /** Top 10% of the day's field → single ring on the scorecard. */
  top10?: boolean;
}

export type DailyDoneMap = Record<string, DailyResultEntry>;

// Today's standing among everyone who played it. NOT part of the cache (see the
// file header) — defined here only because it's the daily-results shape the page's
// rank state is typed against.
export interface DailyRank {
  rank: number;
  total: number;
}

// Account identity is (name, PIN), not the name alone — the same name with a
// different PIN is a DIFFERENT account, so one account must never paint another
// same-name account's cached record. Key on accountTag, the shared (normalized
// name, PIN) namespace used by dailyPending: it matches the server's identity
// boundary (name normalization) and hashes the PIN rather than storing it raw.
const cache = new Map<string, DailyDoneMap>();

export function getCachedDailyDone(
  username: string,
  pin: string,
): DailyDoneMap | null {
  return cache.get(accountTag(username, pin)) ?? null;
}

export function setCachedDailyDone(
  username: string,
  pin: string,
  done: DailyDoneMap,
): void {
  cache.set(accountTag(username, pin), done);
}
