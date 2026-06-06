// Daily Challenge ghosts — the AI filler field for a daily tournament. Unlike the
// standard (mode-agnostic) ghosts in scripts/seedGhosts.ts, these are CONSTRAINED
// to a specific day's board: every starter is drafted from that slot's (team,
// decade) and is eligible for the slot's lineup position, and the sixth man comes
// from the bench slot — exactly the constraints a human faces that day. They're
// generated LAZILY the first time a date's daily tournament is played and stored
// in nba_tournament.main.ghosts tagged ghost_type='daily' + ghost_date.
//
// Because the daily board never repeats a team across its six slots, each ghost's
// six players come from six distinct teams — so the six are automatically distinct
// players; there's no cross-slot dedup to worry about.

import type { QueryOptions } from "./motherduck";
import { canPlay, type SlotKind } from "./positions";
import { getPlayerIndex, type IndexedPlayer } from "./queries";
import { simulateRoster, type ScoringPlayer } from "./scoring";
import { hashSeed, mulberry32 } from "./tournament";
import { queryRW, TDB } from "./tournamentDb";
import type { DailyBoard } from "./daily";
import type { SimPick } from "./types";

// Lineup positions for the five starter slots, in board order.
const KINDS: SlotKind[] = ["G", "FLEX", "W", "FLEX", "B"];

export const DAILY_GHOST_COUNT = 15;

// Arcade-flavored daily ghost names (need at least DAILY_GHOST_COUNT).
const NAME_POOL = [
  "DAY TRADERS", "SUNRISE SQUAD", "CALENDAR CREW", "NIGHT OWLS", "RISE AND GRIND",
  "CLOCKWORK", "DAILY GRIND", "MORNING SHIFT", "HIGH NOON", "GOLDEN HOUR",
  "TODAY'S SPECIAL", "FRESH BATCH", "PRIME TIME", "LATE SHOW", "OVERNIGHT",
] as const;

/** Map an indexed player into the scoring shape (mirrors hydrateRoster). */
function toScoring(p: IndexedPlayer): ScoringPlayer {
  return {
    gq: p.value, mpg: p.mpg,
    pts: p.pts, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk,
    fga: p.fga, fg3a: p.fg3a, fg3m: p.fg3m, fta: p.fta, tov: p.tov,
    fgm: p.fgm, ftm: p.ftm,
    tsplus: Number.isFinite(p.tsplus) ? p.tsplus : 1,
    height_in: Number.isFinite(p.height_in) ? p.height_in : 79,
    pos: p.pos ?? null,
    allDef: p.all_def ?? 0,
  };
}

export interface GeneratedDailyGhost {
  ghostId: number;
  name: string;
  roster: SimPick[];
  sixth: { entity_id: string; team: string; decade: number };
  seedNet: number;
}

/**
 * Find an assignment of the 5 board slots to the 5 lineup positions
 * [G,FLEX,W,FLEX,B] such that each position has at least one eligible player —
 * exactly the freedom a human has (a slot's player can fill any position it's
 * eligible for). `elig[boardSlot][position]` is the eligible-player list.
 * Returns `assignment[position] = boardSlot` (a permutation), or null if no
 * assignment works (a board that can't field a legal lineup at all). Searches in
 * board-slot index order so the result is deterministic.
 */
function findAssignment(elig: IndexedPlayer[][][]): number[] | null {
  const used = new Set<number>();
  const assignment: number[] = [];
  const bt = (pos: number): boolean => {
    if (pos === KINDS.length) return true;
    for (let bs = 0; bs < elig.length; bs++) {
      if (used.has(bs) || elig[bs][pos].length === 0) continue;
      used.add(bs);
      assignment[pos] = bs;
      if (bt(pos + 1)) return true;
      used.delete(bs);
    }
    return false;
  };
  return bt(0) ? assignment : null;
}

/**
 * Build the daily ghost field for `board` from the player index, seeded by
 * `date` (so a given day always yields the same ghosts). Returns [] if the board
 * can't field a legal six (a sparse day where no position assignment works — the
 * human would be stuck too, so there's simply no daily tournament that day).
 */
export function buildDailyGhosts(
  board: DailyBoard,
  index: IndexedPlayer[],
  date: string,
): GeneratedDailyGhost[] {
  if (!board.benchSlot || board.slots.length < KINDS.length) return [];

  const byCombo = (team: string, decade: number) =>
    index.filter((p) => p.team === team && p.decade === decade);

  // For each board slot, the players it can field at each lineup position.
  const comboPlayers = board.slots.map((s) => byCombo(s.team, s.decade));
  const elig = comboPlayers.map((players) =>
    KINDS.map((kind) => players.filter((p) => canPlay(p, kind))),
  );
  const assignment = findAssignment(elig); // position → board slot
  const benchCands = byCombo(board.benchSlot.team, board.benchSlot.decade);
  if (!assignment || benchCands.length === 0) return [];

  const rng = mulberry32(hashSeed(`daily-ghosts:${date}`));
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

  const ghosts: GeneratedDailyGhost[] = [];
  for (let i = 0; i < DAILY_GHOST_COUNT; i++) {
    // Position j drafts an eligible player from its assigned board slot.
    const starters = KINDS.map((_, pos) => {
      const bs = assignment[pos];
      return { player: pick(elig[bs][pos]), slot: pos };
    });
    const sixth = pick(benchCands);
    const seedNet = simulateRoster(
      starters.map((s) => toScoring(s.player)),
    ).netRating;
    ghosts.push({
      ghostId: i,
      name: NAME_POOL[i] ?? `DAILY ${i + 1}`,
      roster: starters.map((s) => ({
        entity_id: s.player.entity_id,
        team: s.player.team,
        decade: s.player.decade,
        slot: s.slot,
      })),
      sixth: {
        entity_id: sixth.entity_id,
        team: sixth.team,
        decade: sixth.decade,
      },
      seedNet,
    });
  }
  return ghosts;
}

/**
 * Ensure a date's daily ghost field exists in the ghosts table. Idempotent: if
 * the date already has a full field, it's a no-op; otherwise it generates +
 * (re)inserts. Called lazily from the daily submit path. Safe to call when the
 * field can't be built (sparse day) — it just inserts nothing.
 */
export async function ensureDailyGhosts(
  board: DailyBoard,
  date: string,
  options: QueryOptions = {},
): Promise<void> {
  const existing = await queryRW<{ n: number }>(
    `SELECT count(*) AS n FROM ${TDB}.ghosts
      WHERE ghost_type = 'daily' AND ghost_date = $1`,
    [date],
  );
  if ((existing[0]?.n ?? 0) >= DAILY_GHOST_COUNT) return;

  const index = await getPlayerIndex(options);
  const ghosts = buildDailyGhosts(board, index, date);
  if (ghosts.length === 0) return;

  // Replace any partial field for the date, then insert the full set.
  await queryRW(
    `DELETE FROM ${TDB}.ghosts WHERE ghost_type = 'daily' AND ghost_date = $1`,
    [date],
  );
  for (const g of ghosts) {
    await queryRW(
      `INSERT INTO ${TDB}.ghosts
         (ghost_id, name, roster_json, sixth_json, seed_net, ghost_type, ghost_date)
       VALUES ($1, $2, $3, $4, $5, 'daily', $6)`,
      [
        g.ghostId,
        g.name,
        JSON.stringify(g.roster),
        JSON.stringify(g.sixth),
        g.seedNet,
        date,
      ],
    );
  }
}
