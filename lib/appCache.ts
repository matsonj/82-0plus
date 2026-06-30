import { after } from "next/server";
import type { PoolClient } from "pg";
import { queryRW, type QueryParam } from "./tournamentDb";
import {
  ensureCacheSchema,
  withTx,
  queryRW as pgQueryRW,
  type QueryParam as PgParam,
} from "./oltpDb";

// ── Self-managed derived-data cache ──────────────────────────────────────────
//
// The hot read queries used to recompute the expensive `game_quality` VIEW on
// every call (a within-week round-robin self-join over ~1.46M box-score rows).
// The player card alone ran that ~39k times/month at ~265ms each. The source is
// append-only NBA history that changes at most once/day, so we MATERIALIZE what
// those queries need.
//
// TWO-TIER cache:
//   • MotherDuck `app_cache` (this file's BUILD_* SQL) — the analytical staging
//     area. The heavy aggregations run here, against the NBA source on MotherDuck.
//   • Postgres `tournament.cache_*` (lib/oltpDb) — the SERVING copy. The request
//     path reads the three small tables from here (always-warm Postgres) so it
//     never touches MotherDuck. A rebuild recomputes on MotherDuck, then pushes
//     the small tables across (pushCacheToPostgres). This is what lets the
//     MotherDuck duckling sleep: it bills wall-clock awake time, and serving point
//     lookups from it kept it awake ~24/7. The rebuild is driven by a daily cron
//     (app/api/cron/rebuild-cache), not per request.
//
// `app_cache` is owned by MOTHERDUCK_RW_TOKEN, so reads of it go through the RW
// pool (lib/tournamentDb). Those reads now happen only during a rebuild.

/** Fully-qualified MotherDuck cache schema. Tables are referenced as `ACDB.<table>`. */
export const ACDB = "app_cache.main";

/** Postgres serving-cache schema/qualifier (tables are `tournament.cache_*`). */
export const PGC = "tournament";

/** Source (read-only) NBA tables the cache is derived from. */
const SRC = "nba_box_scores_v2.main";

/** Read a cached table through the MotherDuck RW pool (the RW token owns `app_cache`).
 *  Used only by the rebuild path now — the request path reads Postgres (readPgCache). */
export function readCache<T = Record<string, unknown>>(
  sql: string,
  params: QueryParam[] = [],
): Promise<T[]> {
  return queryRW<T>(sql, params);
}

/** Read the serving copy from the always-warm Postgres (the request hot path).
 *  Goes through the oltpDb pool (not oltpReadDb): these tables are non-sensitive
 *  public derived data, so they don't need the dedicated low-privilege auth-read
 *  role — and oltpReadDb's `server-only` guard would break the build/seed scripts
 *  that import this module. */
export function readPgCache<T = Record<string, unknown>>(
  sql: string,
  params: PgParam[] = [],
): Promise<T[]> {
  return pgQueryRW<T>(sql, params);
}

declare global {
  // eslint-disable-next-line no-var
  var __app_cache_ready__: boolean | undefined;
}

/**
 * Has the cache been built at least once? (a `status='ready'` row in cache_meta,
 * which buildAll writes LAST — so ready implies every table is populated.) Lets a
 * caller tell "this id legitimately has no rows" (return empty — the live query
 * would too) apart from "cache not built yet" (fall back to the live query),
 * instead of paying the expensive view for every empty result. Memoized true:
 * rebuilds replace tables in place, never drop them, so readiness is monotonic.
 */
export async function isCacheReady(): Promise<boolean> {
  if (globalThis.__app_cache_ready__) return true;
  try {
    const rows = await pgQueryRW(
      `SELECT 1 FROM ${PGC}.cache_meta WHERE cache_key = 'global' AND status = 'ready' LIMIT 1`,
    );
    if (rows.length > 0) {
      globalThis.__app_cache_ready__ = true;
      return true;
    }
    return false;
  } catch {
    return false; // cache_meta missing / Postgres unreachable → treat as not built
  }
}

// ── Build SQL (one CREATE OR REPLACE per table, in dependency order) ─────────
//
// 1. game_quality — a straight snapshot of the live view. The expensive
//    self-join runs exactly ONCE here; everything downstream reads the table.
//    Physically sorted by entity_id so the rebuild joins below (which group per
//    entity) get row-group locality. DuckDB stores rows in CTAS order and keeps
//    per-row-group min/max zonemaps, so the sort also prunes any future
//    entity-keyed scan of this table.
const BUILD_GAME_QUALITY = `CREATE OR REPLACE TABLE ${ACDB}.game_quality AS
  SELECT * FROM ${SRC}.game_quality ORDER BY entity_id`;

// 2. player_season_stats — the player-card rollup (lib/queries.getPlayerSeasonHistory),
//    pre-aggregated for ALL players keyed by entity_id. The card query is
//    `WHERE entity_id = $1 ORDER BY season`, so the table is physically sorted
//    `entity_id, season`: DuckDB's per-row-group min/max zonemaps then skip every
//    row group that can't contain the entity (this is the hot read path). GQ
//    comes from the materialized table.
const BUILD_PLAYER_SEASON_STATS = `CREATE OR REPLACE TABLE ${ACDB}.player_season_stats AS
  SELECT g.entity_id,
         s.season_year AS season,
         b.team_abbreviation AS team,
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
   GROUP BY g.entity_id, s.season_year, b.team_abbreviation
  HAVING count(*) >= 5
   ORDER BY g.entity_id, season, gp DESC, team`;

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

// Cache SHAPE version — bump whenever the COLUMNS/grouping of any cached table
// change (not the source data). It's folded into the fingerprint below, so a
// deploy that changes a table's shape forces a rebuild on the next freshness
// check even though the underlying NBA source is unchanged. Without this, a
// pre-existing cache built on the old shape keeps serving stale-shaped rows until
// the 24h max-age — e.g. player_season_stats merged-by-season rows would mask the
// new per-(season,team) split rows the PlayerCard now expects.
//   v2: player_season_stats split per (season, team) for mid-season trades.
const CACHE_SCHEMA_VERSION = "2";

// Cheap source fingerprint across EVERY table the cache derives from, so a
// backfill/correction to any of them triggers a rebuild — not just new games in
// `schedule`. (`game_quality` is a view of box_scores+schedule, so it needs no
// separate signal.) Row counts + the latest game date are metadata-cheap; this
// catches additions/backfills. Pure in-place value edits that don't change a row
// count won't trip it — a manual `scripts/buildCache.ts` run covers that rare case.
const SOURCE_FINGERPRINT_SQL = `SELECT
    (SELECT count(*)::VARCHAR || ':' || COALESCE(max(game_date)::VARCHAR, '') FROM ${SRC}.schedule)
    || '|' || (SELECT count(*)::VARCHAR FROM ${SRC}.box_scores)
    || '|' || (SELECT count(*)::VARCHAR FROM ${SRC}.all_defense)
    || '|' || (SELECT count(*)::VARCHAR FROM ${SRC}.player_bio) AS fp`;

async function sourceFingerprint(): Promise<string> {
  const rows = await queryRW<{ fp: string }>(SOURCE_FINGERPRINT_SQL);
  // Prefix the schema version so a shape change invalidates the stored fp.
  return `v${CACHE_SCHEMA_VERSION}|${rows[0]?.fp ?? ""}`;
}

// ── Push MotherDuck app_cache → Postgres serving cache ───────────────────────
//
// Each MotherDuck `app_cache` table → its Postgres `tournament.cache_*` mirror,
// with an explicit column list so physical order on either side is irrelevant.
// None of these columns are jsonb (unlike the OLTP migration), so the copy is a
// plain value bind.
const PG_PUSH: { src: string; dst: string; cols: string[] }[] = [
  {
    src: "player_index",
    dst: "cache_player_index",
    cols: [
      "entity_id", "player_name", "team", "decade", "best_season", "value",
      "gp", "mpg", "pts", "reb", "ast", "fga", "fg3a", "fta", "stl", "blk",
      "tov", "fg3m", "fgm", "ftm", "tsplus", "height_in", "pos", "all_def", "debut",
    ],
  },
  {
    src: "player_season_stats",
    dst: "cache_player_season_stats",
    cols: [
      "entity_id", "season", "team", "gq", "usg", "gp", "pts", "reb", "ast",
      "stl", "blk", "fg_pct", "ft_pct", "tov", "fg3m", "all_def",
    ],
  },
  {
    src: "team_decade_weights",
    dst: "cache_team_decade_weights",
    cols: ["decade", "team", "weight"],
  },
];

// Postgres caps a statement at 65535 bind params; keep (rows × cols) under it.
const INSERT_CHUNK = 1000;

// Arbitrary fixed key for the transaction-level advisory lock that serializes the
// cache swap across all instances/processes (see pushCacheToPostgres). The literal
// is > int4 max so Postgres reads it unambiguously as the bigint pg_advisory_xact_lock
// overload.
const CACHE_SWAP_LOCK_KEY = 8204820482;

/** Multi-row INSERT in chunks, on a transaction's client. */
async function bulkInsert(
  client: PoolClient,
  table: string,
  cols: string[],
  rows: Record<string, unknown>[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const slice = rows.slice(i, i + INSERT_CHUNK);
    const params: unknown[] = [];
    const tuples = slice.map((row, r) => {
      const ph = cols.map((c, ci) => {
        params.push(row[c] ?? null);
        return `$${r * cols.length + ci + 1}`;
      });
      return `(${ph.join(", ")})`;
    });
    await client.query(
      `INSERT INTO ${PGC}.${table} (${cols.join(", ")}) VALUES ${tuples.join(", ")}`,
      params,
    );
  }
}

/**
 * Copy the three small derived tables from the MotherDuck `app_cache` staging area
 * into the Postgres serving cache, atomically. The SELECTs run on MotherDuck (the
 * only time this data leaves the duckling); the Postgres side runs in ONE
 * transaction — DELETE + reinsert each table, then stamp cache_meta — so readers
 * see either the whole old cache or the whole new one, never a half-swapped state.
 * DELETE (not TRUNCATE) so concurrent readers keep seeing the old rows via MVCC
 * until COMMIT, with no exclusive lock. Returns the total row count pushed.
 */
export async function pushCacheToPostgres(fp?: string): Promise<number> {
  await ensureCacheSchema();
  const data = await Promise.all(
    PG_PUSH.map((t) =>
      readCache<Record<string, unknown>>(
        `SELECT ${t.cols.join(", ")} FROM ${ACDB}.${t.src}`,
      ),
    ),
  );
  // Provenance fingerprint of the data we're about to serve:
  //  • buildAll passes the fp it just computed from the CURRENT source — authoritative.
  //  • copy-only seed (no fp): stamp the fp the EXISTING app_cache build recorded, NOT
  //    today's source. Otherwise copying a STALE app_cache while stamping the current
  //    source fp would make the cron see a match and skip the rebuild it actually needs.
  //    If app_cache carries no usable provenance, stamp a sentinel that can never equal
  //    a real source fp, forcing the next cron to rebuild.
  let builtFp: string;
  if (fp !== undefined) {
    builtFp = fp;
  } else {
    const md = await readCache<{ source_fp: string }>(
      `SELECT source_fp FROM ${ACDB}.cache_meta WHERE cache_key = 'global' AND status = 'ready' LIMIT 1`,
    );
    builtFp = md[0]?.source_fp ?? "seed-copy-unprovenanced";
  }
  return withTx(async (client) => {
    // Serialize the whole swap across instances/processes: two concurrent
    // DELETE-all + INSERT-all transactions on these (constraint-free) tables could
    // otherwise interleave into duplicated rows. A transaction-level advisory lock
    // (auto-released on COMMIT/ROLLBACK; PgBouncer-safe because withTx pins one
    // backend for the txn) makes a second swap wait, then cleanly delete the first
    // swap's committed rows before reinserting.
    await client.query(`SELECT pg_advisory_xact_lock(${CACHE_SWAP_LOCK_KEY})`);
    for (let i = 0; i < PG_PUSH.length; i++) {
      await client.query(`DELETE FROM ${PGC}.${PG_PUSH[i].dst}`);
      await bulkInsert(client, PG_PUSH[i].dst, PG_PUSH[i].cols, data[i]);
    }
    // Upsert the single meta row (cache_key is the PK) — idempotent even if two
    // swaps somehow reach here, no DELETE+INSERT window that could leave 0 or 2 rows.
    await client.query(
      `INSERT INTO ${PGC}.cache_meta (cache_key, built_at, source_fp, status)
         VALUES ('global', now(), $1, 'ready')
       ON CONFLICT (cache_key) DO UPDATE
         SET built_at = EXCLUDED.built_at,
             source_fp = EXCLUDED.source_fp,
             status = EXCLUDED.status`,
      [builtFp],
    );
    const res = await client.query<{ built_at: Date }>(
      `SELECT built_at FROM ${PGC}.cache_meta WHERE cache_key = 'global' LIMIT 1`,
    );
    const builtAt = res.rows[0]?.built_at;
    // Record the exact build our warm globals are now consistent with (read back so
    // it equals what reconcileWarmCachesIfDue will read — a local clock wouldn't).
    globalThis.__app_cache_seen_built_at__ = builtAt
      ? new Date(builtAt).getTime()
      : undefined;
    globalThis.__app_cache_ready__ = true;
    return data.reduce((n, rows) => n + rows.length, 0);
  });
}

/**
 * Drop the in-process warm caches that are derived from the cache tables, so they
 * reload from the freshly-rebuilt data on next access. (These globals are declared
 * in lib/queries.ts and lib/tournamentQueries.ts; we reset them here because a
 * rebuild is the moment they go stale, and importing those modules would cycle.)
 */
function invalidateWarmCaches(): void {
  globalThis.__player_index__ = undefined;
  globalThis.__team_weights__ = undefined;
  globalThis.__stat_norms__ = undefined;
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
  // Push the freshly-built small tables to the Postgres serving cache (the request
  // path reads them there, never MotherDuck). This also stamps the Postgres
  // cache_meta and records __app_cache_seen_built_at__ for warm-cache reconcile.
  const pushed = await pushCacheToPostgres(fp);
  console.log(`[app_cache] pushed ${pushed.toLocaleString()} rows to Postgres`);
  // Drop this process's now-stale warm caches so they reload from the new data.
  invalidateWarmCaches();
}

declare global {
  // eslint-disable-next-line no-var
  var __app_cache_build__: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var __app_cache_last_check__: number | undefined;
  // built_at (ms) this process has reconciled its warm caches with.
  // eslint-disable-next-line no-var
  var __app_cache_seen_built_at__: number | undefined;
  // Single-flight guard for the cheap request-path warm reconcile.
  // eslint-disable-next-line no-var
  var __app_cache_reconcile_inflight__: boolean | undefined;
  // Single-flight guard for the cron rebuild check. SEPARATE from the reconcile
  // guard on purpose: sharing one flag let a cheap reconcile make the daily cron
  // return early ("check-in-flight") and skip its only rebuild window.
  // eslint-disable-next-line no-var
  var __app_cache_refresh_inflight__: boolean | undefined;
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

/** Force a full rebuild (the manual scripts/buildCache.ts entrypoint). Awaits completion. */
export function rebuildCache(): Promise<void> {
  return runBuild();
}

// Don't re-reconcile warm globals more than this often per process (avoids a
// Postgres round-trip on every request — the reconcile is cheap but pointless to
// repeat constantly).
const RECONCILE_INTERVAL_MS = 60 * 60 * 1000; // 1h
// The cron rebuilds if the cache is older than this even when the source
// fingerprint is unchanged (a backstop against a missed/failed source signal).
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Schedule a warm-cache reconcile to run AFTER the response (Next's `after()` keeps
 * the serverless instance alive via waitUntil until it settles). Outside a request
 * scope (scripts/board-gen) `after()` throws; there we run it detached.
 *
 * This is the request-path hook. It is CHEAP and Postgres-only: it never rebuilds
 * and never touches MotherDuck — it just lets a long-lived warm instance notice a
 * rebuild the daily cron performed and drop its stale in-memory globals. Safe to
 * call on every request (gated to ≤1×/hour/process and single-flight).
 */
export function scheduleWarmReconcile(): void {
  try {
    after(() => reconcileWarmCachesIfDue());
  } catch {
    void reconcileWarmCachesIfDue();
  }
}

/**
 * Drop this process's warm globals if the Postgres serving cache has been rebuilt
 * (by the cron) since we last loaded them. One cheap point read of cache_meta; NO
 * MotherDuck access, NO rebuild. Gated once/hour/process and single-flight.
 */
async function reconcileWarmCachesIfDue(): Promise<void> {
  const now = Date.now();
  if (globalThis.__app_cache_reconcile_inflight__) return;
  if (
    globalThis.__app_cache_last_check__ &&
    now - globalThis.__app_cache_last_check__ < RECONCILE_INTERVAL_MS
  ) {
    return;
  }
  globalThis.__app_cache_reconcile_inflight__ = true;
  try {
    const rows = await pgQueryRW<{ built_at: Date }>(
      `SELECT built_at FROM ${PGC}.cache_meta WHERE cache_key = 'global' AND status = 'ready' LIMIT 1`,
    );
    const row = rows[0];
    if (row) {
      globalThis.__app_cache_ready__ = true;
      const builtAtMs = new Date(row.built_at).getTime();
      // Fires on first observation too (seen === undefined): a process can warm
      // __player_index__ from an older build before its first reconcile, so adopting
      // a build without clearing would pin stale data. Equality holds after our own
      // build (pushCacheToPostgres recorded its exact built_at), so no needless reload.
      if (globalThis.__app_cache_seen_built_at__ !== builtAtMs) {
        globalThis.__app_cache_seen_built_at__ = builtAtMs;
        invalidateWarmCaches();
      }
    }
    globalThis.__app_cache_last_check__ = Date.now(); // gate set only after success
  } catch {
    // Postgres hiccup — leave the gate unset so the next request retries soon.
  } finally {
    globalThis.__app_cache_reconcile_inflight__ = false;
  }
}

/**
 * Rebuild the cache if the source changed or it has aged past MAX_AGE_MS. This is
 * the DAILY CRON entrypoint (app/api/cron/rebuild-cache) — the only thing that
 * wakes MotherDuck now. It reads the last-built fingerprint from the Postgres
 * serving cache, computes the current MotherDuck source fingerprint (one cheap
 * count query), and rebuilds (recompute on MotherDuck → push to Postgres) only when
 * they differ or the cache is stale. Single-flight; returns what it decided.
 */
export async function refreshCacheIfStale(): Promise<{
  rebuilt: boolean;
  reason: string;
}> {
  if (globalThis.__app_cache_refresh_inflight__) {
    return { rebuilt: false, reason: "check-in-flight" };
  }
  globalThis.__app_cache_refresh_inflight__ = true;
  try {
    let meta: { built_at: Date; source_fp: string } | undefined;
    try {
      const rows = await pgQueryRW<{ built_at: Date; source_fp: string }>(
        `SELECT built_at, source_fp FROM ${PGC}.cache_meta WHERE cache_key = 'global' AND status = 'ready' LIMIT 1`,
      );
      meta = rows[0];
    } catch {
      // cache_meta table missing → treat as never built.
    }
    if (!meta) {
      await runBuild();
      return { rebuilt: true, reason: "not-built" };
    }
    const fp = await sourceFingerprint();
    if (fp !== meta.source_fp) {
      await runBuild();
      return { rebuilt: true, reason: "source-changed" };
    }
    if (Date.now() - new Date(meta.built_at).getTime() > MAX_AGE_MS) {
      await runBuild();
      return { rebuilt: true, reason: "max-age" };
    }
    return { rebuilt: false, reason: "fresh" };
  } finally {
    globalThis.__app_cache_refresh_inflight__ = false;
  }
}
