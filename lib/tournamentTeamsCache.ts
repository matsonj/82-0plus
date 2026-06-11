import type { TournamentLookupResponse, MyPrivateRow } from "@/lib/types";

// Client-only, in-memory (module singleton) cache of a signed-in account's My
// Teams data: the legacy team lookup (Daily/Ranked/Classic teams) and the private
// tournament list. Same role as lib/dailyResultsCache — it survives client-side
// route navigation (Home <-> /tournament) but not a full reload, so a remount can
// paint the last-known list immediately and revalidate in the background instead
// of flashing the booting-session loader. A genuine cold load still shows the
// loader until the first POST resolves.
//
// Account identity is (name, PIN) — the same name with a different PIN is a
// DIFFERENT account — so we key on both (JSON.stringify keeps the two fields
// unambiguous). The credentialed POSTs (/api/tournament/lookup,
// /api/private-tournament/my) remain the source of truth; this is only a render
// hint to remove the navigation flash. See [[dailyResultsCache]] for the sibling
// pattern on the daily-results menu state.

interface CachedTeams {
  lookup: TournamentLookupResponse | null;
  privateRows: MyPrivateRow[] | null;
}

const cache = new Map<string, CachedTeams>();

function accountKey(username: string, pin: string): string {
  return JSON.stringify([username, pin]);
}

export function getCachedTeams(
  username: string,
  pin: string,
): CachedTeams | null {
  return cache.get(accountKey(username, pin)) ?? null;
}

// Patch one or both slots, preserving whichever isn't provided — the lookup and
// the private list load via separate paths, so a refresh of one must not wipe the
// other's cached value.
export function patchCachedTeams(
  username: string,
  pin: string,
  patch: Partial<CachedTeams>,
): void {
  const key = accountKey(username, pin);
  const prev = cache.get(key) ?? { lookup: null, privateRows: null };
  cache.set(key, { ...prev, ...patch });
}
