import type { TournamentLookupResponse } from "@/lib/types";
import { accountTag } from "@/lib/dailyPending";

// Client-only, in-memory (module singleton) cache of a signed-in account's My
// Teams lookup (their Daily/Ranked/Classic teams). Same role as
// lib/dailyResultsCache: it survives client-side route navigation (Home <->
// /tournament) but not a full reload, so a remount paints the last-known team list
// immediately and revalidates in the background instead of flashing the
// booting-session loader. A cold load still blocks on the first fetch.
//
// We cache ONLY the team lookup, whose rows are immutable once a team's bracket has
// run (record, margin, champion, reached-round, seed/tier are all fixed). We do NOT
// cache the private-tournament list: an OPEN private tournament's provisional
// standing and per-row attention state move as other entrants submit/sim, so —
// like today's daily rank — that must come fresh from /api/private-tournament/my on
// every load rather than be painted from a stale snapshot.
//
// Account identity is (name, PIN) — the same name with a different PIN is a
// DIFFERENT account — so we key on accountTag, the shared (normalized name, PIN)
// namespace from dailyPending (matches the server identity boundary; hashes the PIN
// rather than storing it raw). The credentialed POST (/api/tournament/lookup)
// remains the source of truth; this is only a render hint to remove the navigation
// flash. See [[dailyResultsCache]] for the sibling pattern on the daily menu state.

const cache = new Map<string, TournamentLookupResponse>();

export function getCachedTeams(
  username: string,
  pin: string,
): TournamentLookupResponse | null {
  return cache.get(accountTag(username, pin)) ?? null;
}

export function setCachedTeams(
  username: string,
  pin: string,
  lookup: TournamentLookupResponse,
): void {
  cache.set(accountTag(username, pin), lookup);
}
