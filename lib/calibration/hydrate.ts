// ============================================================================
// Pure, pool-injected roster hydration.
//
// Mirrors lib/tournamentQueries.ts `hydrateTournamentRoster` + `toScoring`, but
// takes an in-memory player pool instead of touching the DB, and is synchronous.
// That keeps the historical-reconstruction core unit-testable with fixture rows
// and lets the CLI hydrate hundreds of teams off a single cached player index.
//
// The output (HydratedTeam) is deliberately config-INDEPENDENT: seedNet and the
// full SimResult are recomputed per candidate at replay time, since scoring
// overrides change them.
// ============================================================================

import type { ScoringPlayer } from "../scoring";
import type { IndexedPlayer } from "../queries";
import type { SimPick } from "../types";
import type { HydratedTeam, PlayerMeta } from "./types";

/** Neutral years-of-experience fallback when a debut season is unknown — matches
 *  lib/tournamentQueries.NEUTRAL_EXP. */
const NEUTRAL_EXP = 6;
const DEFAULT_HEIGHT = 79;

/** Stored roster row (teams and ghosts share these columns). */
export interface StoredTeamRow {
  team_id?: string;
  ghost_id?: number | string;
  name: string;
  roster_json: unknown; // SimPick[] (JSON column → string on the pg endpoint)
  sixth_json: unknown; // { entity_id, team, decade }
  captain_slot?: number | null;
  seed_net?: number | null;
}

type StoredSixth = { entity_id: string; team: string; decade: number };

const pickKey = (entity_id: string, team: string, decade: number) =>
  `${entity_id}|${team}|${decade}`;

/** Parse a JSON column (the pg endpoint returns JSON as a string). */
export function parseJson<T>(value: unknown): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

/** Index a player pool by (entity_id, team, decade) for O(1) pick lookup. */
export function buildPlayerMap(pool: IndexedPlayer[]): Map<string, IndexedPlayer> {
  return new Map(pool.map((p) => [pickKey(p.entity_id, p.team, p.decade), p]));
}

/** entity_id → debut season (first non-null occurrence), the age proxy. */
export function buildDebutMap(pool: IndexedPlayer[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of pool) {
    if (p.debut != null && !map.has(p.entity_id)) map.set(p.entity_id, p.debut);
  }
  return map;
}

/** Map an indexed player into the scoring shape (mirrors tournamentQueries.toScoring). */
function toScoring(p: IndexedPlayer): ScoringPlayer {
  return {
    gq: p.value,
    season: p.best_season,
    mpg: p.mpg,
    pts: p.pts,
    reb: p.reb,
    ast: p.ast,
    stl: p.stl,
    blk: p.blk,
    fga: p.fga,
    fg3a: p.fg3a,
    fg3m: p.fg3m,
    fta: p.fta,
    tov: p.tov,
    fgm: p.fgm,
    ftm: p.ftm,
    tsplus: Number.isFinite(p.tsplus) ? p.tsplus : 1,
    height_in: Number.isFinite(p.height_in) ? p.height_in : DEFAULT_HEIGHT,
    pos: p.pos ?? null,
    allDef: p.all_def ?? 0,
  };
}

function metaOf(p: IndexedPlayer): PlayerMeta {
  return {
    entity_id: p.entity_id,
    name: p.player_name,
    team: p.team,
    season: p.best_season,
    height_in: Number.isFinite(p.height_in) ? p.height_in : DEFAULT_HEIGHT,
    pos: p.pos ?? null,
    blk: p.blk,
  };
}

const heightOf = (p: IndexedPlayer) =>
  Number.isFinite(p.height_in) ? p.height_in : DEFAULT_HEIGHT;

/**
 * Hydrate a player pick into the slot-ordered five + sixth man, computing the
 * config-independent team metadata (ageAtPeak, sixthManAge, heightTotal). Returns
 * null if any pick is unresolvable against the pool (a stale stored roster), so a
 * single bad team never breaks a whole field reconstruction.
 */
export function hydrateTeamFromPool(
  row: StoredTeamRow,
  id: string,
  isGhost: boolean,
  playerMap: Map<string, IndexedPlayer>,
  debutMap: Map<string, number>,
): HydratedTeam | null {
  try {
    const picks = parseJson<SimPick[]>(row.roster_json);
    const sixth = parseJson<StoredSixth>(row.sixth_json);
    if (!Array.isArray(picks) || picks.length !== 5) return null;

    // Slot order [G,FLEX,W,FLEX,B] — captain_slot indexes into this ordering.
    const ordered = [...picks].sort((a, b) => a.slot - b.slot);
    const rows = ordered.map((pk) =>
      playerMap.get(pickKey(pk.entity_id, pk.team, pk.decade)),
    );
    if (rows.some((r) => !r)) return null;
    const starterRows = rows as IndexedPlayer[];

    const sixthRow = playerMap.get(
      pickKey(sixth.entity_id, sixth.team, sixth.decade),
    );
    if (!sixthRow) return null;

    const expAt = (entityId: string, bestSeason: number) => {
      const debut = debutMap.get(entityId);
      return debut ? bestSeason - debut : NEUTRAL_EXP;
    };
    const sixthManAge = expAt(sixthRow.entity_id, sixthRow.best_season);
    let expSum = sixthManAge;
    for (const p of starterRows) expSum += expAt(p.entity_id, p.best_season);
    const ageAtPeak = expSum / (starterRows.length + 1);

    const heightTotal =
      starterRows.reduce((acc, p) => acc + heightOf(p), 0) + heightOf(sixthRow);

    return {
      id,
      name: row.name,
      isGhost,
      starters: starterRows.map(toScoring),
      sixthMan: toScoring(sixthRow),
      captainSlot: typeof row.captain_slot === "number" ? row.captain_slot : 0,
      ageAtPeak,
      sixthManAge,
      heightTotal,
      starterMeta: starterRows.map(metaOf),
    };
  } catch {
    return null;
  }
}
