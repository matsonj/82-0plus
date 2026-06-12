// ============================================================================
// Historical field reconstruction.
//
// V1 replays REAL public tournament fields. Each public `teams` row stored the
// full 16-team field it played (in bracket_json.teams), with ids `team:<uuid>`
// and `ghost:<id>`. We:
//   1. sample the newest public anchor brackets, stratified across modes;
//   2. collect every referenced team/ghost id;
//   3. batch-fetch + hydrate those rows against the cached player index;
//   4. rebuild each anchor's original field as a ReplayField.
//
// The original bracket used the anchor's bare team_id as the simulateBracket
// seedKey, so we reuse it — the luck draw matches the original run.
//
// The pure core (`reconstructFields`) takes already-hydrated teams + anchor
// specs, so it is unit-testable with fixtures and never touches the DB. The
// DB-backed `loadHistoricalFields` injects the query fn + player pool.
// ============================================================================

import type { IndexedPlayer } from "../queries";
import type { BracketSize } from "../tournament";
import type { TournamentMode } from "../types";
import type { HydratedTeam, ReplayField } from "./types";
import {
  buildDebutMap,
  buildPlayerMap,
  hydrateTeamFromPool,
  parseJson,
  type StoredTeamRow,
} from "./hydrate";

/** Injected query fn (the CLI passes lib/tournamentDb.queryRW). */
export type QueryFn = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>;

/** The fixed field a stored anchor played, extracted from its bracket_json. */
export interface AnchorSpec {
  seedKey: string; // bare team_id (matches the original simulateBracket seed)
  mode: TournamentMode;
  size: BracketSize;
  teamIds: string[]; // "team:<uuid>" / "ghost:<id>" in bracket order
}

const VALID_SIZES = new Set<number>([4, 8, 12, 16, 20]);

/** Default per-mode sampling weights when splitting a sample budget. */
const MODE_WEIGHT: Record<string, number> = { classic: 3, hoopiq: 2, daily: 1 };

/** Split a total sample budget across modes by weight (≈ classic 300 / hoopiq
 *  200 / daily 100 at sampleSize 600 with all three modes). */
export function stratify(
  sampleSize: number,
  modes: TournamentMode[],
): Record<TournamentMode, number> {
  const totalWeight = modes.reduce((s, m) => s + (MODE_WEIGHT[m] ?? 1), 0) || 1;
  const out = {} as Record<TournamentMode, number>;
  let assigned = 0;
  modes.forEach((m, i) => {
    if (i === modes.length - 1) {
      out[m] = Math.max(0, sampleSize - assigned); // last mode soaks rounding
    } else {
      const n = Math.round((sampleSize * (MODE_WEIGHT[m] ?? 1)) / totalWeight);
      out[m] = n;
      assigned += n;
    }
  });
  return out;
}

interface AnchorRow {
  team_id: string;
  mode: string;
  bracket_json: unknown;
}

/** Parse one anchor DB row into an AnchorSpec, or null if the bracket_json is
 *  unusable (missing teams, bad size). */
export function parseAnchorRow(row: AnchorRow): AnchorSpec | null {
  try {
    const bracket = parseJson<{
      teams?: { id?: string }[];
      size?: number;
    }>(row.bracket_json);
    const teams = bracket?.teams ?? [];
    const teamIds = teams.map((t) => t?.id).filter((id): id is string => !!id);
    if (teamIds.length < 4) return null;
    const size = (VALID_SIZES.has(bracket?.size ?? NaN)
      ? bracket!.size
      : teamIds.length) as number;
    if (!VALID_SIZES.has(size)) return null;
    return {
      seedKey: row.team_id,
      mode: row.mode as TournamentMode,
      size: size as BracketSize,
      teamIds,
    };
  } catch {
    return null;
  }
}

/** Fetch the newest public anchors per mode, parse their stored fields. */
export async function fetchHistoricalAnchors(
  queryFn: QueryFn,
  modes: TournamentMode[],
  sampleSize: number,
): Promise<AnchorSpec[]> {
  const perMode = stratify(sampleSize, modes);
  const anchors: AnchorSpec[] = [];
  for (const mode of modes) {
    const limit = perMode[mode] ?? 0;
    if (limit <= 0) continue;
    const rows = await queryFn<AnchorRow>(
      `SELECT CAST(team_id AS VARCHAR) AS team_id, mode, bracket_json
         FROM nba_tournament.main.teams
        WHERE mode = $1 AND bracket_json IS NOT NULL
        ORDER BY created_at DESC
        LIMIT ${Math.floor(limit)}`,
      [mode],
    );
    for (const row of rows) {
      const spec = parseAnchorRow(row);
      if (spec) anchors.push(spec);
    }
  }
  return anchors;
}

const stripPrefix = (id: string) =>
  id.startsWith("team:") ? id.slice(5) : id.startsWith("ghost:") ? id.slice(6) : id;

/** Batch-fetch every referenced team/ghost row, hydrate against the pool. */
async function fetchHydratedTeams(
  queryFn: QueryFn,
  anchors: AnchorSpec[],
  pool: IndexedPlayer[],
): Promise<Map<string, HydratedTeam>> {
  const teamBareIds = new Set<string>();
  const ghostBareIds = new Set<string>();
  for (const a of anchors) {
    for (const id of a.teamIds) {
      if (id.startsWith("team:")) teamBareIds.add(stripPrefix(id));
      else if (id.startsWith("ghost:")) ghostBareIds.add(stripPrefix(id));
    }
  }

  const playerMap = buildPlayerMap(pool);
  const debutMap = buildDebutMap(pool);
  const out = new Map<string, HydratedTeam>();

  const chunk = <T>(arr: T[], n: number): T[][] => {
    const cs: T[][] = [];
    for (let i = 0; i < arr.length; i += n) cs.push(arr.slice(i, i + n));
    return cs;
  };

  // Teams.
  for (const ids of chunk([...teamBareIds], 400)) {
    if (ids.length === 0) continue;
    const ph = ids.map((_, i) => `$${i + 1}`).join(",");
    const rows = await queryFn<StoredTeamRow>(
      `SELECT CAST(team_id AS VARCHAR) AS team_id, team_name AS name,
              roster_json, sixth_json, captain_slot, seed_net
         FROM nba_tournament.main.teams
        WHERE CAST(team_id AS VARCHAR) IN (${ph})`,
      ids,
    );
    for (const row of rows) {
      const id = `team:${row.team_id}`;
      const t = hydrateTeamFromPool(row, id, false, playerMap, debutMap);
      if (t) out.set(id, t);
    }
  }

  // Ghosts.
  for (const ids of chunk([...ghostBareIds], 400)) {
    if (ids.length === 0) continue;
    const ph = ids.map((_, i) => `$${i + 1}`).join(",");
    const rows = await queryFn<StoredTeamRow>(
      `SELECT CAST(ghost_id AS VARCHAR) AS ghost_id, name,
              roster_json, sixth_json, seed_net
         FROM nba_tournament.main.ghosts
        WHERE CAST(ghost_id AS VARCHAR) IN (${ph})`,
      ids,
    );
    for (const row of rows) {
      const id = `ghost:${row.ghost_id}`;
      const t = hydrateTeamFromPool(row, id, true, playerMap, debutMap);
      if (t) out.set(id, t);
    }
  }

  return out;
}

/**
 * Pure: rebuild each anchor's original field from already-hydrated teams. An
 * anchor is dropped (with a reason) if it can't be fully reconstructed — e.g. a
 * referenced roster no longer resolves against the current player index.
 */
export function reconstructFields(
  anchors: AnchorSpec[],
  hydratedById: Map<string, HydratedTeam>,
): { fields: ReplayField[]; dropped: number } {
  const fields: ReplayField[] = [];
  let dropped = 0;
  for (const a of anchors) {
    const teams = a.teamIds.map((id) => hydratedById.get(id));
    if (teams.some((t) => !t) || teams.length !== a.size) {
      dropped++;
      continue;
    }
    fields.push({
      id: a.seedKey,
      source: "historical",
      mode: a.mode,
      size: a.size,
      teams: (teams as HydratedTeam[]).map((team) => ({ team })),
    });
  }
  return { fields, dropped };
}

/** DB-backed end-to-end: sample anchors, hydrate, reconstruct fields. */
export async function loadHistoricalFields(
  queryFn: QueryFn,
  pool: IndexedPlayer[],
  modes: TournamentMode[],
  sampleSize: number,
): Promise<{ fields: ReplayField[]; anchors: number; dropped: number }> {
  const anchors = await fetchHistoricalAnchors(queryFn, modes, sampleSize);
  const hydrated = await fetchHydratedTeams(queryFn, anchors, pool);
  const { fields, dropped } = reconstructFields(anchors, hydrated);
  return { fields, anchors: anchors.length, dropped };
}
