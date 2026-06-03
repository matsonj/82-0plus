import { query, type QueryParam } from "./motherduck";
import type { PlayerOption } from "./types";

// All SQL lives here. Decade buckets use `season_year - (season_year % 10)`
// because DuckDB `/` is float division. Regular Season only for fairness.
// Tables are fully qualified: we connect to the "md:" workspace (read-only
// tokens can't switch the active database), so unqualified names won't resolve.
const DB = "nba_box_scores_v2.main";

/**
 * Available decades — derived from the player index so every decade we offer
 * actually has draftable players. (The schedule has older seasons, e.g. the
 * 1940s, that are too sparse to produce any qualifying players; offering them
 * would dead-end the slot machine with a 404.)
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

export interface IndexedPlayer extends PlayerOption {
  team: string;
  decade: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __player_index__: Promise<IndexedPlayer[]> | undefined;
}

/**
 * Compute, for every (player, team, decade), the player's VALUE = highest
 * single-season median Game Quality, with the displayed stats taken FROM THAT
 * SAME peak season.
 *
 * The `game_quality` view is expensive (a weekly all-vs-all self-join over the
 * whole table), and it can't be filtered to one team without still computing the
 * full week — so we run it ONCE for the entire league and cache the small result
 * (a few thousand rows) in the server process. Every team load is then an
 * in-memory filter.
 */
/**
 * Read the precomputed index. Prefers the materialized
 * `nba_box_scores_v2.main.player_index` table (a fast SELECT — refresh it after
 * a backfill with the CREATE OR REPLACE in computePlayerIndexLive's SQL), and
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
              -- Era backfill: the NBA didn't record some stats in early eras, so
              -- estimate them from what WAS recorded. Game Quality is computed
              -- in-DB and stays era-internally fair, so this only feeds the
              -- scoring fit factors + derived position. Cutoffs use real data.
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
              -- 3PM: no 3pt line before 1979-80. From FT% (touch), role, volume.
              round(CASE WHEN season_year < 1980
                    THEN (fga * CASE WHEN reb >= 9 THEN 0.06
                                     WHEN ast >= 4.5 AND reb <= 5 THEN 0.36
                                     ELSE 0.24 END)
                         * greatest(0.20, least(0.40,
                             0.5 * (CASE WHEN fta > 0 THEN ftm / fta ELSE 0.5 END) - 0.02))
                    ELSE fg3m END, 1) AS fg3m
         FROM ranked
        WHERE rn = 1`,
  );
}

/** Begin computing the index without blocking (used to warm the cache at game start). */
export function warmPlayerIndex(): void {
  void getPlayerIndex().catch(() => {});
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Players for a team+decade, ranked by value (peak season-median GQ), from the cached index. */
export async function getPlayers(
  team: string,
  decade: number,
  q: string | null,
): Promise<PlayerOption[]> {
  const index = await getPlayerIndex();
  const nq = q ? norm(q.trim()) : "";
  return index
    .filter(
      (p) =>
        p.team === team &&
        p.decade === decade &&
        (nq === "" || norm(p.player_name).includes(nq)),
    )
    // Sort by minutes per game (not Game Quality — that stays hidden).
    .sort((a, b) => b.mpg - a.mpg)
    .slice(0, 60);
}

// Re-exported for callers that still pass typed params elsewhere.
export type { QueryParam };
