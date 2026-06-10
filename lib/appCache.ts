import { queryRW, type QueryParam } from "./tournamentDb";

// ── Self-managed derived-data cache (`app_cache` database) ───────────────────
//
// The hot read queries used to recompute the expensive `game_quality` VIEW on
// every call (a within-week round-robin self-join over ~1.46M box-score rows).
// The player card alone ran that ~39k times/month at ~265ms each. The source is
// append-only NBA history that changes at most once/day, so we MATERIALIZE what
// those queries need into a separate `app_cache` database the app owns (via the
// RW token — the read token can't write) and refresh it lazily / on a daily cron.
//
// `app_cache` is owned by MOTHERDUCK_RW_TOKEN, so reads of it go through the RW
// pool (lib/tournamentDb), same as the tournament tables. The lookups are now a
// trivial indexed scan (sub-ms), so the lack of read-pool session-hint sharding
// on this path doesn't matter.

/** Fully-qualified cache schema. Tables are referenced as `ACDB.<table>`. */
export const ACDB = "app_cache.main";

/** Source (read-only) NBA tables the cache is derived from. */
const SRC = "nba_box_scores_v2.main";

/** Read a cached table through the RW pool (the RW token owns `app_cache`). */
export function readCache<T = Record<string, unknown>>(
  sql: string,
  params: QueryParam[] = [],
): Promise<T[]> {
  return queryRW<T>(sql, params);
}

// ── Build SQL (one CREATE OR REPLACE per table, in dependency order) ─────────
//
// 1. game_quality — a straight snapshot of the live view. The expensive
//    self-join runs exactly ONCE here; everything downstream reads the table.
const BUILD_GAME_QUALITY = `CREATE OR REPLACE TABLE ${ACDB}.game_quality AS
  SELECT * FROM ${SRC}.game_quality`;

// 2. player_season_stats — the player-card rollup (lib/queries.getPlayerSeasonHistory),
//    pre-aggregated for ALL players keyed by entity_id. The card query becomes
//    `WHERE entity_id = $1 ORDER BY season`. GQ comes from the materialized table.
const BUILD_PLAYER_SEASON_STATS = `CREATE OR REPLACE TABLE ${ACDB}.player_season_stats AS
  SELECT g.entity_id,
         s.season_year AS season,
         mode(b.team_abbreviation) AS team,
         round(median(g.game_quality), 3) AS gq,
         round(avg(b.fg_attempted) + 0.44 * avg(b.ft_attempted) + avg(b.turnovers), 1) AS usg,
         count(*) AS gp,
         round(avg(b.points), 1)   AS pts,
         round(avg(b.rebounds), 1) AS reb,
         round(avg(b.assists), 1)  AS ast,
         round(avg(b.steals), 1)   AS stl,
         round(avg(b.blocks), 1)   AS blk,
         COALESCE(round(100.0 * sum(b.fg_made) / nullif(sum(b.fg_attempted), 0)), 0) AS fg_pct,
         COALESCE(round(100.0 * sum(b.ft_made) / nullif(sum(b.ft_attempted), 0)), 0) AS ft_pct,
         round(avg(b.turnovers), 1) AS tov,
         round(avg(b.fg3_made), 1)  AS fg3m,
         COALESCE(max(ad.all_team), 0) AS all_def
    FROM ${ACDB}.game_quality g
    JOIN ${SRC}.box_scores b
      ON g.game_id = b.game_id AND g.entity_id = b.entity_id AND b.period = 'FullGame'
    JOIN ${SRC}.schedule s ON g.game_id = s.game_id
    LEFT JOIN ${SRC}.all_defense ad
      ON ad.entity_id = g.entity_id AND ad.season_year = s.season_year
   WHERE g.game_quality >= 0
     AND s.season_type = 'Regular Season'
   GROUP BY g.entity_id, s.season_year
  HAVING count(*) >= 5`;

// 3. player_index — mirrors lib/queries.computePlayerIndexLive, but sources GQ
//    from the materialized table (fast) and adds a `debut` column (career first
//    season) so the age proxy needs no separate query. Keep this in sync with
//    computePlayerIndexLive if the index ever changes shape.
const BUILD_PLAYER_INDEX = `CREATE OR REPLACE TABLE ${ACDB}.player_index AS
  WITH per_season AS (
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
              avg(b.fg_made)       AS fgm, avg(b.ft_made) AS ftm,
              avg(b.turnovers) AS tov
         FROM ${ACDB}.game_quality g
         JOIN ${SRC}.box_scores b
           ON g.game_id = b.game_id AND g.entity_id = b.entity_id AND b.period = 'FullGame'
         JOIN ${SRC}.schedule s ON g.game_id = s.game_id
        WHERE g.game_quality >= 0
          AND s.season_type = 'Regular Season'
        GROUP BY 1, 2, 3, 4, 5
       HAVING count(*) >= 20
     ),
     league_ts AS (
       SELECT s.season_year,
              sum(b.points) / (2 * (sum(b.fg_attempted) + 0.44 * sum(b.ft_attempted))) AS lg_ts
         FROM ${SRC}.box_scores b
         JOIN ${SRC}.schedule s ON b.game_id = s.game_id
        WHERE b.period = 'FullGame' AND s.season_type = 'Regular Season'
        GROUP BY 1
     ),
     debut_cte AS (
       SELECT b.entity_id, MIN(s.season_year) AS debut
         FROM ${SRC}.box_scores b
         JOIN ${SRC}.schedule s USING (game_id)
        WHERE b.period = 'FullGame' AND s.season_type = 'Regular Season'
        GROUP BY 1
     ),
     ranked AS (
       SELECT *,
              row_number() OVER (
                PARTITION BY entity_id, team, decade ORDER BY med_gq DESC
              ) AS rn
         FROM per_season
     )
     SELECT r.entity_id, player_name, team, decade,
            r.season_year AS best_season,
            round(med_gq, 3) AS value, gp, round(mpg, 1) AS mpg,
            round(pts, 1) AS pts, round(reb, 1) AS reb, round(ast, 1) AS ast,
            round(fga, 1) AS fga, round(fg3a, 1) AS fg3a, round(fta, 1) AS fta,
            round(CASE WHEN r.season_year < 1974
                  THEN 0.7 + 0.6 * greatest(0, least(1, (ast - 2) / 6.0))
                           + 0.2 * (1 - greatest(0, least(1, (reb - 4) / 8.0)))
                  ELSE stl END, 2) AS stl,
            round(CASE WHEN r.season_year < 1974
                  THEN 0.3 + 1.6 * greatest(0, least(1, (reb - 4) / 8.0))
                  ELSE blk END, 2) AS blk,
            round(CASE WHEN r.season_year < 1978
                  THEN 0.5 + 0.09 * (fga + 0.44 * fta) + 0.18 * ast
                  ELSE tov END, 1) AS tov,
            round(CASE
                  WHEN r.season_year < 1980
                  THEN (fga * CASE WHEN reb >= 9 THEN 0.10
                                   WHEN ast >= 4.5 AND reb <= 5 THEN 0.42
                                   ELSE 0.30 END)
                       * greatest(0.22, least(0.42,
                           0.5 * (CASE WHEN fta > 0 THEN ftm / fta ELSE 0.5 END) + 0.03))
                  WHEN r.season_year < 2000 AND reb >= 9
                  THEN greatest(fg3m, fga * 0.10
                       * greatest(0.22, least(0.42,
                           0.5 * (CASE WHEN fta > 0 THEN ftm / fta ELSE 0.5 END) + 0.03)))
                  ELSE fg3m END, 1) AS fg3m,
            round(fgm, 1) AS fgm, round(ftm, 1) AS ftm,
            round(greatest(0.80, least(1.30,
              CASE WHEN (fga + 0.44 * fta) > 0 AND lt.lg_ts > 0
                   THEN (pts / (2 * (fga + 0.44 * fta))) / lt.lg_ts
                   ELSE 1.0 END)), 3) AS tsplus,
            COALESCE(pb.height_in, 79) AS height_in,
            pb.pos AS pos,
            COALESCE(ad.all_team, 0) AS all_def,
            dc.debut AS debut
       FROM ranked r
       JOIN league_ts lt ON lt.season_year = r.season_year
       LEFT JOIN debut_cte dc ON dc.entity_id = r.entity_id
       LEFT JOIN ${SRC}.player_bio pb ON pb.entity_id = r.entity_id
       LEFT JOIN ${SRC}.all_defense ad ON ad.entity_id = r.entity_id AND ad.season_year = r.season_year
      WHERE rn = 1`;

// 4. team_decade_weights — the slot-machine roll weights for every decade at
//    once (lib/queries.getTeamWeights). Tiny; loaded fully into memory by the app.
const BUILD_TEAM_DECADE_WEIGHTS = `CREATE OR REPLACE TABLE ${ACDB}.team_decade_weights AS
  SELECT s.season_year - (s.season_year % 10) AS decade,
         b.team_abbreviation AS team,
         count(DISTINCT s.season_year) AS weight
    FROM ${SRC}.box_scores b
    JOIN ${SRC}.schedule s USING (game_id)
   WHERE b.period = 'FullGame' AND s.season_type = 'Regular Season'
   GROUP BY 1, 2`;

/** Cheap source fingerprint: row count + latest game date of the schedule.
 *  New games bump one or both, so an unchanged fingerprint means an unchanged
 *  cache — skip the multi-second rebuild. */
const SOURCE_FINGERPRINT_SQL = `SELECT count(*)::VARCHAR || ':' ||
  COALESCE(max(game_date)::VARCHAR, '') AS fp FROM ${SRC}.schedule`;

async function sourceFingerprint(): Promise<string> {
  const rows = await queryRW<{ fp: string }>(SOURCE_FINGERPRINT_SQL);
  return rows[0]?.fp ?? "";
}

/** Run the full build (CREATE OR REPLACE all tables) and stamp cache_meta. */
async function buildAll(): Promise<void> {
  await queryRW(`CREATE DATABASE IF NOT EXISTS app_cache`);
  await queryRW(`CREATE SCHEMA IF NOT EXISTS ${ACDB}`);
  await queryRW(
    `CREATE TABLE IF NOT EXISTS ${ACDB}.cache_meta (
       cache_key VARCHAR, built_at TIMESTAMP, source_fp VARCHAR, status VARCHAR)`,
  );
  const fp = await sourceFingerprint();
  // The heavy one first; the rest read the materialized game_quality.
  await queryRW(BUILD_GAME_QUALITY);
  await queryRW(BUILD_PLAYER_SEASON_STATS);
  await queryRW(BUILD_PLAYER_INDEX);
  await queryRW(BUILD_TEAM_DECADE_WEIGHTS);
  await queryRW(`DELETE FROM ${ACDB}.cache_meta WHERE cache_key = 'global'`);
  await queryRW(
    `INSERT INTO ${ACDB}.cache_meta (cache_key, built_at, source_fp, status)
       VALUES ('global', now(), $1, 'ready')`,
    [fp],
  );
}

declare global {
  // eslint-disable-next-line no-var
  var __app_cache_build__: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var __app_cache_last_check__: number | undefined;
}

/** Single-flight wrapper around buildAll (per process). Cross-instance dupes are
 *  harmless — CREATE OR REPLACE is idempotent — but this avoids self-stampede. */
function runBuild(): Promise<void> {
  if (!globalThis.__app_cache_build__) {
    globalThis.__app_cache_build__ = buildAll()
      .catch((err) => {
        console.error("[app_cache] build failed", err);
        throw err;
      })
      .finally(() => {
        globalThis.__app_cache_build__ = undefined;
      });
  }
  return globalThis.__app_cache_build__;
}

/** Force a full rebuild (used by the daily cron). Awaits completion. */
export function rebuildCache(): Promise<void> {
  return runBuild();
}

// Don't re-check freshness more than this often per process (avoids a fingerprint
// round-trip on every request). The cron is the primary trigger; this is a backstop.
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1h
// Consider the cache stale after this long even if the fingerprint check is gated.
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Lazy stale-while-revalidate backstop. Cheap, gated to once/hour per process,
 * and NON-blocking for the caller (schedule it via `after()`): it serves the
 * current snapshot and rebuilds in the background only when the source actually
 * changed or the cache is missing/old. NEVER call this on the synchronous read
 * path — the rebuild is multi-second.
 */
export async function refreshCacheIfStale(): Promise<void> {
  const now = Date.now();
  if (
    globalThis.__app_cache_last_check__ &&
    now - globalThis.__app_cache_last_check__ < CHECK_INTERVAL_MS
  ) {
    return;
  }
  globalThis.__app_cache_last_check__ = now;
  try {
    const meta = await queryRW<{ built_at: Date; source_fp: string }>(
      `SELECT built_at, source_fp FROM ${ACDB}.cache_meta WHERE cache_key = 'global' LIMIT 1`,
    );
    const row = meta[0];
    if (!row) {
      await runBuild(); // never built → build it
      return;
    }
    const ageMs = now - new Date(row.built_at).getTime();
    const fp = await sourceFingerprint();
    if (fp !== row.source_fp || ageMs > MAX_AGE_MS) {
      await runBuild();
    }
  } catch (err) {
    // cache_meta / app_cache missing → first build
    console.error("[app_cache] freshness check failed; rebuilding", err);
    await runBuild().catch(() => {});
  }
}
