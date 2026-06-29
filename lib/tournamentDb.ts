import { Pool, types } from "pg";

// MotherDuck READ-WRITE pool. Used ONLY to build the OLAP `app_cache` derived data
// (lib/appCache.ts, scripts/buildCache.ts), which CREATEs/INSERTs into app_cache
// from nba_box_scores_v2 via cross-database SQL that must run on MotherDuck. The
// transactional tournament tables (users, teams, daily_results, ghosts, private_*)
// moved to Postgres (lib/oltpDb.ts) and are no longer touched through this pool.
//
// MotherDuck's PostgreSQL wire endpoint is a pure-JS driver (no native binaries →
// works cleanly on Vercel) and still runs DuckDB SQL. A SEPARATE pool from
// lib/motherduck.ts, on a SEPARATE token (MOTHERDUCK_RW_TOKEN), connecting to the
// default workspace ("md:") with fully-qualified table names.
// https://motherduck.com/docs/sql-reference/postgres-endpoint/

// DuckDB/PG numeric types arrive as strings by default; coerce to JS numbers.
// Mirror lib/motherduck.ts so reads-after-write return numbers, not strings.
types.setTypeParser(20, (v) => parseInt(v, 10)); // int8 / bigint (counts)
types.setTypeParser(1700, (v) => parseFloat(v)); // numeric
// Timezone-naive DuckDB TIMESTAMP holds UTC wall-clock; parse oid 1114 as UTC
// (pg's default treats it as local, double-applying the machine offset).
types.setTypeParser(1114, (v) => new Date(v.replace(" ", "T") + "Z"));

const PG_HOST =
  process.env.MOTHERDUCK_PG_HOST ?? "pg.us-east-1-aws.motherduck.com";
const PG_POOL_MAX = parsePositiveInt(process.env.MOTHERDUCK_RW_POOL_MAX, 2);

declare global {
  // eslint-disable-next-line no-var
  var __md_rw_pool__: Pool | undefined;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** A single cached RW pool (no session-hint sharding — writes don't read-scale). */
function getPool(): Pool {
  const token = process.env.MOTHERDUCK_RW_TOKEN;
  if (!token) {
    throw new Error(
      "MOTHERDUCK_RW_TOKEN is not set. Add it to .env.local (see .env.example).",
    );
  }
  if (globalThis.__md_rw_pool__) return globalThis.__md_rw_pool__;

  const pool = new Pool({
    host: PG_HOST,
    port: 5432,
    user: "postgres",
    password: token,
    database: "md:",
    ssl: { rejectUnauthorized: true },
    max: PG_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  globalThis.__md_rw_pool__ = pool;
  return pool;
}

export type QueryParam = string | number | boolean | null;

/** Run a write (or read-after-write) query against MotherDuck. Params bind to
 *  `$1`, `$2`, … Used by the app_cache build path only. */
export async function queryRW<T = Record<string, unknown>>(
  sql: string,
  params: QueryParam[] = [],
): Promise<T[]> {
  const res = await getPool().query(sql, params);
  return res.rows as T[];
}
