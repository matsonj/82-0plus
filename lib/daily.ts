// Daily Challenge board — the fixed, date-seeded set of (team, decade) slots
// every player drafts from on a given day. Extracted from app/api/daily so the
// tournament submit route can RE-DERIVE the same board server-side and verify a
// daily entry's picks against it (the daily equivalent of a signed roll receipt:
// the board is deterministic, so picks that don't match it are forgeries).
//
// The board is 5 starter slots (lineup order [G,FLEX,W,FLEX,B]) plus a 6th BENCH
// slot for the sixth man — the same six a Classic/Ranked team fields. The first
// five are byte-identical to what /api/daily has always produced; the bench is a
// 6th draw appended to the same seeded sequence (so existing days don't shift).

import type { QueryOptions } from "./motherduck";
import { getDecades, getPlayableTeams, getTeamWeights } from "./queries";
import { hashSeed, mulberry32 } from "./tournament";

export const DAILY_STARTER_SLOTS = 5;
// 5 starters + 1 bench (sixth man).
const DAILY_TOTAL_SLOTS = DAILY_STARTER_SLOTS + 1;

export interface DailySlot {
  team: string;
  decade: number;
}

export interface DailyBoard {
  slots: DailySlot[]; // up to 5 starter slots, in lineup order
  benchSlot: DailySlot | null; // the 6th (sixth man); null on a sparse day
}

function weightedPick<T>(items: T[], weights: number[], rng: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * The deterministic daily board for `date` (YYYY-MM-DD). Drafted teams never
 * repeat; used decades decay 90% per use so the slots spread across eras. Uses
 * the SAME FNV hash + mulberry32 seed as the original /api/daily so the first
 * five slots reproduce exactly; the bench is the 6th draw.
 */
export async function computeDailyBoard(
  date: string,
  options: QueryOptions = {},
): Promise<DailyBoard> {
  const rng = mulberry32(hashSeed(`82-0+:${date}`));

  const decades = await getDecades(options);
  const playableByDecade = new Map(
    await Promise.all(
      decades.map(
        async (d) =>
          [d, await getPlayableTeams(d, options)] as [number, Set<string>],
      ),
    ),
  );
  const teamWeightsCache = new Map<number, { team: string; weight: number }[]>();
  const teamWeightsFor = async (d: number) => {
    if (!teamWeightsCache.has(d)) {
      teamWeightsCache.set(d, await getTeamWeights(d, options));
    }
    return teamWeightsCache.get(d)!;
  };

  const usedTeams = new Set<string>();
  const usage: Record<number, number> = {};
  const all: DailySlot[] = [];

  for (let round = 0; round < DAILY_TOTAL_SLOTS; round++) {
    // Decades that still have an un-used, playable team — drafted teams never repeat.
    const candidates = decades.filter((d) =>
      [...playableByDecade.get(d)!].some((t) => !usedTeams.has(t)),
    );
    if (candidates.length === 0) break;
    const decade = weightedPick(
      candidates,
      candidates.map((d) => Math.pow(0.1, usage[d] ?? 0)),
      rng,
    );

    const playable = playableByDecade.get(decade)!;
    // Sort deterministically (DB tie order isn't stable) so the seed reproduces.
    const pool = (await teamWeightsFor(decade))
      .filter((t) => playable.has(t.team) && !usedTeams.has(t.team))
      .sort((a, b) => b.weight - a.weight || a.team.localeCompare(b.team));
    const team = weightedPick(
      pool.map((t) => t.team),
      pool.map((t) => t.weight),
      rng,
    );

    usedTeams.add(team);
    usage[decade] = (usage[decade] ?? 0) + 1;
    all.push({ team, decade });
  }

  return {
    slots: all.slice(0, DAILY_STARTER_SLOTS),
    benchSlot: all[DAILY_STARTER_SLOTS] ?? null,
  };
}
