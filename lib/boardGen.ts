// Shared deterministic (team, decade) board generator.
//
// Both the Daily board (lib/daily.ts, seeded by the date) and the BLIND private
// tournament board (lib/privateBoard.ts, seeded by the tournament UUID) draft
// from the SAME weighted, decade-decaying algorithm. The only differences are
// the seed string, how many slots they want, and whether a short data day is
// tolerated (daily: yes; private blind: no). This module owns that ONE canonical
// loop so future Daily tuning can't silently drift from the private board.
//
// The loop is, per round:
//   • candidate decades = those that still have an un-used, playable team
//     (drafted teams never repeat);
//   • pick a decade weighted by 0.1^(times that decade has already been used)
//     (90% decay per use, so slots spread across eras);
//   • within that decade, sort the playable, un-used teams by weight desc with a
//     localeCompare tie-break (DB row order isn't stable, so this keeps the seed
//     reproducible) and pick one weighted by team weight.
// RNG is mulberry32(hashSeed(seed)) — the same FNV hash + PRNG used everywhere.

import type { QueryOptions } from "./motherduck";
import { getDecades, getPlayableTeams, getTeamWeights } from "./queries";
import { hashSeed, mulberry32 } from "./tournament";

export interface TeamDecadeSlot {
  team: string;
  decade: number;
}

export interface BuildBoardArgs {
  /** Seed string (e.g. `82-0+:${date}` or `private-board:${tournamentId}`). */
  seed: string;
  /** How many (team, decade) slots to draft. */
  totalSlots: number;
  /**
   * When true, throw if the data can't fill `totalSlots` distinct slots.
   * When false (daily's sparse-day behavior), return as many as it can.
   */
  requireFull: boolean;
  options?: QueryOptions;
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
 * The canonical deterministic board generator. Produces up to `totalSlots`
 * distinct (team, decade) slots; teams never repeat and decade usage decays 90%
 * per use. With `requireFull` it throws if it can't reach `totalSlots`.
 *
 * NOTE: the seed string + loop semantics are load-bearing — both Daily and the
 * blind private board reproduce historical boards from them, so do not change
 * the seeding or the pick math here without intentionally re-rolling boards.
 */
export async function buildTeamDecadeBoard({
  seed,
  totalSlots,
  requireFull,
  options = {},
}: BuildBoardArgs): Promise<TeamDecadeSlot[]> {
  const rng = mulberry32(hashSeed(seed));

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
  const all: TeamDecadeSlot[] = [];

  for (let round = 0; round < totalSlots; round++) {
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

  if (requireFull && all.length < totalSlots) {
    throw new Error(
      `cannot build a full ${totalSlots}-slot board for seed "${seed}": ` +
        `only ${all.length} distinct (team, decade) slots available`,
    );
  }

  return all;
}
