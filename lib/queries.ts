import { query } from "./motherduck";
import { eligiblePositions } from "./positions";
import type { GameMode, PublicPlayer, SimPick, SimRosterLine } from "./types";
import type { ScoringPlayer } from "./scoring";

// All SQL lives here. Decade buckets use `season_year - (season_year % 10)`
// because DuckDB `/` is float division. Regular Season only for fairness.
// Tables are fully qualified: we connect to the "md:" workspace (read-only
// tokens can't switch the active database), so unqualified names won't resolve.
const DB = "nba_box_scores_v2.main";

/** Full per-(player, team, decade) row — server-side only (carries GQ + sim inputs). */
export interface IndexedPlayer {
  entity_id: string;
  player_name: string;
  team: string;
  decade: number;
  best_season: number;
  value: number; // peak season-median Game Quality (scoring only, never sent to client)
  gp: number;
  mpg: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fga: number;
  fg3a: number;
  fg3m: number;
  fta: number;
  tov: number;
}

/**
 * Available decades — derived from the player index so every decade we offer
 * actually has draftable players. (The schedule has older seasons, e.g. the
 * 1940s, that are too sparse to produce any qualifying players; offering them
 * would dead-end the slot machine.)
 */
export async function getDecades(): Promise<number[]> {
  const index = await getPlayerIndex();
  return [...new Set(index.map((p) => p.decade))].sort((a, b) => a - b);
}

/** Teams that appear in a decade, with a weight = number of seasons present. */
export async function getTeamWeights(
  decade: number,
): Promise<{ team: string; weight: number }[]> {
  return query<{ team: string; weight: number }>(
    `SELECT b.team_abbreviation AS team,
            count(DISTINCT s.season_year) AS weight
       FROM ${DB}.box_scores b
       JOIN ${DB}.schedule s USING (game_id)
      WHERE b.period = 'FullGame'
        AND s.season_type = 'Regular Season'
        AND s.season_year - (s.season_year % 10) = $1
      GROUP BY 1
      ORDER BY weight DESC`,
    [decade],
  );
}

declare global {
  // eslint-disable-next-line no-var
  var __player_index__: Promise<IndexedPlayer[]> | undefined;
}

/**
 * Read the precomputed index. Prefers the materialized
 * `nba_box_scores_v2.main.player_index` table (a fast SELECT — refresh it after
 * a backfill with the CREATE OR REPLACE of computePlayerIndexLive's SQL), and
 * falls back to computing it live if the table is missing or empty.
 */
export function getPlayerIndex(): Promise<IndexedPlayer[]> {
  if (!globalThis.__player_index__) {
    globalThis.__player_index__ = (async () => {
      try {
        const rows = await query<IndexedPlayer>(
          `SELECT entity_id, player_name, team, decade, best_season, value, gp, mpg,
                  pts, reb, ast, fga, fg3a, fta, stl, blk, tov, fg3m
             FROM ${DB}.player_index`,
        );
        if (rows.length > 0) return rows;
      } catch {
        // table missing → fall through to live compute
      }
      return computePlayerIndexLive();
    })().catch((err) => {
      globalThis.__player_index__ = undefined; // allow retry on failure
      throw err;
    });
  }
  return globalThis.__player_index__;
}

/** Compute the index from scratch (the source query the materialized table uses). */
function computePlayerIndexLive(): Promise<IndexedPlayer[]> {
  return query<IndexedPlayer>(
    `WITH per_season AS (
         SELECT b.entity_id, b.player_name,
                b.team_abbreviation AS team,
                s.season_year - (s.season_year % 10) AS decade,
                s.season_year,
                median(g.game_quality) AS med_gq, count(*) AS gp,
                avg(
                  try_cast(split_part(b.minutes, ':', 1) AS INTEGER)
                  + try_cast(split_part(b.minutes, ':', 2) AS INTEGER) / 60.0
                ) AS mpg,
                avg(b.points)   AS pts, avg(b.rebounds) AS reb, avg(b.assists) AS ast,
                avg(b.steals)   AS stl, avg(b.blocks)   AS blk,
                avg(b.fg_attempted)  AS fga, avg(b.fg3_attempted) AS fg3a,
                avg(b.fg3_made)      AS fg3m, avg(b.ft_attempted) AS fta,
                avg(b.ft_made)       AS ftm, avg(b.turnovers) AS tov
           FROM ${DB}.game_quality g
           JOIN ${DB}.box_scores b
             ON g.game_id = b.game_id AND g.entity_id = b.entity_id AND b.period = 'FullGame'
           JOIN ${DB}.schedule s ON g.game_id = s.game_id
          WHERE g.game_quality >= 0
            AND s.season_type = 'Regular Season'
          GROUP BY 1, 2, 3, 4, 5
         HAVING count(*) >= 20
       ),
       ranked AS (
         SELECT *,
                row_number() OVER (
                  PARTITION BY entity_id, team, decade ORDER BY med_gq DESC
                ) AS rn
           FROM per_season
       )
       SELECT entity_id, player_name, team, decade,
              season_year AS best_season,
              round(med_gq, 3) AS value, gp, round(mpg, 1) AS mpg,
              round(pts, 1) AS pts, round(reb, 1) AS reb, round(ast, 1) AS ast,
              round(fga, 1) AS fga, round(fg3a, 1) AS fg3a, round(fta, 1) AS fta,
              -- Era backfill: estimate stats the NBA didn't record from what it did.
              -- Steals/blocks: not tracked before 1973-74.
              round(CASE WHEN season_year < 1974
                    THEN 0.7 + 0.6 * greatest(0, least(1, (ast - 2) / 6.0))
                             + 0.2 * (1 - greatest(0, least(1, (reb - 4) / 8.0)))
                    ELSE stl END, 2) AS stl,
              round(CASE WHEN season_year < 1974
                    THEN 0.3 + 1.6 * greatest(0, least(1, (reb - 4) / 8.0))
                    ELSE blk END, 2) AS blk,
              -- Turnovers: not tracked before 1977-78. From usage + playmaking.
              round(CASE WHEN season_year < 1978
                    THEN 0.5 + 0.09 * (fga + 0.44 * fta) + 0.18 * ast
                    ELSE tov END, 1) AS tov,
              -- 3PM: no line before 1979-80 → estimate; 1980-99 bigs get a modest floor.
              round(CASE
                    WHEN season_year < 1980
                    THEN (fga * CASE WHEN reb >= 9 THEN 0.10
                                     WHEN ast >= 4.5 AND reb <= 5 THEN 0.42
                                     ELSE 0.30 END)
                         * greatest(0.22, least(0.42,
                             0.5 * (CASE WHEN fta > 0 THEN ftm / fta ELSE 0.5 END) + 0.03))
                    WHEN season_year < 2000 AND reb >= 9
                    THEN greatest(fg3m, fga * 0.10
                         * greatest(0.22, least(0.42,
                             0.5 * (CASE WHEN fta > 0 THEN ftm / fta ELSE 0.5 END) + 0.03)))
                    ELSE fg3m END, 1) AS fg3m
         FROM ranked
        WHERE rn = 1`,
  );
}

/** Begin computing the index without blocking (used to warm the cache at game start). */
export function warmPlayerIndex(): void {
  void getPlayerIndex().catch(() => {});
}

/** Map an internal row to the client-safe DTO (drops GQ + sim-only inputs). */
function toPublic(p: IndexedPlayer, mode: GameMode): PublicPlayer {
  const classic = mode === "classic";
  return {
    entity_id: p.entity_id,
    player_name: p.player_name,
    best_season: p.best_season,
    positions: eligiblePositions(p),
    mpg: classic ? p.mpg : null,
    pts: classic ? p.pts : null,
    reb: classic ? p.reb : null,
    ast: classic ? p.ast : null,
    stl: classic ? p.stl : null,
    blk: classic ? p.blk : null,
  };
}

/** Public player list for a team+decade, sorted by minutes per game (GQ hidden). */
export async function getPlayers(
  team: string,
  decade: number,
  mode: GameMode,
): Promise<PublicPlayer[]> {
  const index = await getPlayerIndex();
  return index
    .filter((p) => p.team === team && p.decade === decade)
    .sort((a, b) => b.mpg - a.mpg)
    .slice(0, 60)
    .map((p) => toPublic(p, mode));
}

/** Decades in which a team has draftable players (for the same-team decade skip). */
export async function getTeamDecades(team: string): Promise<number[]> {
  const index = await getPlayerIndex();
  return [...new Set(index.filter((p) => p.team === team).map((p) => p.decade))].sort(
    (a, b) => a - b,
  );
}

/**
 * Hydrate a roster of (entity_id, team, decade) picks server-side into scoring
 * inputs (incl. GQ) + display lines. The client never submits stats, so it can't
 * fabricate an 82-0 season. Throws if any pick isn't a real index entry.
 */
export async function hydrateRoster(
  picks: SimPick[],
): Promise<{ scoring: ScoringPlayer[]; lines: SimRosterLine[] }> {
  const index = await getPlayerIndex();
  const byKey = new Map(
    index.map((p) => [`${p.entity_id}|${p.team}|${p.decade}`, p]),
  );
  const scoring: ScoringPlayer[] = [];
  const lines: SimRosterLine[] = [];
  for (const pick of picks) {
    const p = byKey.get(`${pick.entity_id}|${pick.team}|${pick.decade}`);
    if (!p) throw new Error(`unknown roster pick: ${pick.entity_id}`);
    scoring.push({
      gq: p.value,
      pts: p.pts, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk,
      fga: p.fga, fg3a: p.fg3a, fg3m: p.fg3m, fta: p.fta, tov: p.tov,
    });
    lines.push({
      entity_id: p.entity_id, player_name: p.player_name, team: p.team,
      best_season: p.best_season, pts: p.pts, reb: p.reb, ast: p.ast,
    });
  }
  return { scoring, lines };
}
