import { Pool, types } from "pg";

// Tournament Edition WRITE path. MotherDuck's PostgreSQL wire endpoint is a
// pure-JS driver (no native binaries → works cleanly on Vercel) and still runs
// DuckDB SQL. https://motherduck.com/docs/sql-reference/postgres-endpoint/
//
// This is a SEPARATE pool from lib/motherduck.ts, on a SEPARATE token
// (MOTHERDUCK_RW_TOKEN), so the read-write token never touches the read path.
// We connect to the default workspace ("md:") and reference tables with
// fully-qualified names — the same approach the read pool uses.

// DuckDB/PG numeric types arrive as strings by default; coerce to JS numbers.
// Mirror lib/motherduck.ts so reads-after-write return numbers, not strings.
types.setTypeParser(20, (v) => parseInt(v, 10)); // int8 / bigint (counts)
types.setTypeParser(1700, (v) => parseFloat(v)); // numeric

const PG_HOST =
  process.env.MOTHERDUCK_PG_HOST ?? "pg.us-east-1-aws.motherduck.com";
const PG_POOL_MAX = parsePositiveInt(process.env.MOTHERDUCK_RW_POOL_MAX, 2);

/** Fully-qualified tournament schema. Writes/reads here reference `TDB.<table>`. */
export const TDB = "nba_tournament.main";

declare global {
  // eslint-disable-next-line no-var
  var __md_rw_pool__: Pool | undefined;
  // eslint-disable-next-line no-var
  var __md_rw_schema__: Promise<void> | undefined;
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

export type QueryParam = string | number | null;

/** Run a write (or read-after-write) query. Params bind to `$1`, `$2`, … */
export async function queryRW<T = Record<string, unknown>>(
  sql: string,
  params: QueryParam[] = [],
): Promise<T[]> {
  const res = await getPool().query(sql, params);
  return res.rows as T[];
}

/**
 * Create the tournament schema + tables if they don't exist. Idempotent and
 * safe to call lazily once per cold start: a module-level promise guards it so
 * concurrent callers run it exactly once (and a failure clears the guard so a
 * later call can retry). DuckDB/MotherDuck does NOT reliably enforce UNIQUE, so
 * name uniqueness is enforced in app code (SELECT before INSERT).
 */
export function ensureSchema(): Promise<void> {
  if (!globalThis.__md_rw_schema__) {
    globalThis.__md_rw_schema__ = (async () => {
      await queryRW(`CREATE SCHEMA IF NOT EXISTS ${TDB.split(".")[0]}.main`);
      await queryRW(
        `CREATE TABLE IF NOT EXISTS ${TDB}.users (
           user_id UUID DEFAULT uuid(), name VARCHAR, name_norm VARCHAR,
           pin_hash VARCHAR, pin_salt VARCHAR, created_at TIMESTAMP DEFAULT now())`,
      );
      await queryRW(
        `CREATE TABLE IF NOT EXISTS ${TDB}.teams (
           team_id UUID DEFAULT uuid(), user_id UUID, team_name VARCHAR, mode VARCHAR,
           roster_json JSON, sixth_json JSON, roster_display JSON, captain_slot INTEGER, seed_net DOUBLE,
           record_w INTEGER, record_l INTEGER, realized_margin DOUBLE, reached_round INTEGER,
           champion_name VARCHAR, bracket_json JSON, created_at TIMESTAMP DEFAULT now())`,
      );
      await queryRW(
        `CREATE TABLE IF NOT EXISTS ${TDB}.ghosts (
           ghost_id INTEGER, name VARCHAR, roster_json JSON, sixth_json JSON, seed_net DOUBLE)`,
      );
    })().catch((err) => {
      globalThis.__md_rw_schema__ = undefined; // allow retry on failure
      throw err;
    });
  }
  return globalThis.__md_rw_schema__;
}
