import { Pool, types } from "pg";

// OLTP store for the tournament/daily transactional tables (users, teams,
// daily_results, ghosts, private_tournaments, private_entries). These were on
// MotherDuck's serverless OLAP engine, where a cold instance added ~5s to tiny
// point lookups on the home-page hot path; they now live on an always-warm
// PlanetScale Postgres. Standard pg wire, so this is the same pg.Pool the
// MotherDuck endpoint used — only the connection target differs.
//
// The analytical data (app_cache.*, nba_box_scores_v*) stays on MotherDuck and is
// reached through lib/tournamentDb.ts (RW) / lib/motherduck.ts (read scaling).

// Postgres hands int8/numeric back as strings by default; coerce to JS numbers so
// callers get numbers (mirrors the MotherDuck pools). NOTE: there is deliberately
// NO oid-1114 override here — the schema uses `timestamptz` (oid 1184), which pg
// parses natively as a correct instant. (The MD pools force-parse the tz-naive
// 1114 type as UTC; that hack does not apply to timestamptz and would be wrong.)
types.setTypeParser(20, (v) => parseInt(v, 10)); // int8 / bigint (counts)
types.setTypeParser(1700, (v) => parseFloat(v)); // numeric

const POOL_MAX = parsePositiveInt(process.env.OLTP_PG_POOL_MAX, 5);

/** Fully-qualified schema. All queries reference `${TDB}.<table>`. */
export const TDB = "tournament";

declare global {
  // eslint-disable-next-line no-var
  var __oltp_pool__: Pool | undefined;
  // eslint-disable-next-line no-var
  var __oltp_schema__: Promise<void> | undefined;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Drop libpq ssl* query params (sslmode, sslrootcert=system, …) from the URL.
 *  node-postgres can mishandle them (e.g. it reads sslrootcert as a file path, so
 *  `=system` crashes on older versions). We verify TLS explicitly via the `ssl`
 *  option below — equivalent to verify-full against Node's bundled CA store, which
 *  PlanetScale's publicly-trusted cert chains to. */
export function cleanConnString(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) {
      if (k.toLowerCase().startsWith("ssl")) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return raw;
  }
}

/** A single cached pool. Postgres stays warm, so there is no read-scaling /
 *  session-hint sharding (that exists only for MotherDuck in lib/motherduck.ts). */
function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add the PlanetScale Postgres connection string " +
        "to .env.local (see .env.example).",
    );
  }
  if (globalThis.__oltp_pool__) return globalThis.__oltp_pool__;

  const pool = new Pool({
    connectionString: cleanConnString(connectionString),
    // PlanetScale presents a publicly-trusted cert; verify it.
    ssl: { rejectUnauthorized: true },
    max: POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  globalThis.__oltp_pool__ = pool;
  return pool;
}

export type QueryParam = string | number | boolean | null;

/** Run a query (read or write). Params bind to `$1`, `$2`, … */
export async function queryRW<T = Record<string, unknown>>(
  sql: string,
  params: QueryParam[] = [],
): Promise<T[]> {
  const res = await getPool().query(sql, params);
  return res.rows as T[];
}

// Schema DDL. Unlike MotherDuck, Postgres enforces PRIMARY KEY / UNIQUE, so the
// one-per-day and one-entry-per-tournament guards are now real constraints (paired
// with ON CONFLICT in the writers) instead of app-level SELECT-before-INSERT only.
// Each statement is idempotent (IF NOT EXISTS) and run once per warm instance.
//
// The `tournament` SCHEMA itself is provisioned out-of-band: the app role is a
// least-privilege login that cannot CREATE SCHEMA (that needs database-level
// privilege on PlanetScale), so an admin runs once:
//   CREATE SCHEMA tournament;
//   GRANT USAGE, CREATE ON SCHEMA tournament TO "<app_role>";
// The app role then owns the tables it creates here (full DML on its own data).
const SCHEMA_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS ${TDB}.users (
     user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name text, name_norm text, pin_hash text, pin_salt text,
     created_at timestamptz DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS users_name_norm_idx ON ${TDB}.users (name_norm)`,

  `CREATE TABLE IF NOT EXISTS ${TDB}.teams (
     team_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid, team_name text, mode text, daily_date text,
     roster_json jsonb, sixth_json jsonb, roster_display jsonb,
     captain_slot integer, seed_net double precision,
     record_w integer, record_l integer, realized_margin double precision,
     reached_round integer, champion_name text, bracket_json jsonb, team_box_json jsonb,
     created_at timestamptz DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS teams_user_idx ON ${TDB}.teams (user_id)`,
  `CREATE INDEX IF NOT EXISTS teams_mode_date_idx ON ${TDB}.teams (mode, daily_date)`,
  `CREATE INDEX IF NOT EXISTS teams_mode_created_idx ON ${TDB}.teams (mode, created_at)`,

  `CREATE TABLE IF NOT EXISTS ${TDB}.ghosts (
     ghost_id integer, name text, roster_json jsonb, sixth_json jsonb,
     seed_net double precision, ghost_type text DEFAULT 'standard', ghost_date text)`,
  `CREATE INDEX IF NOT EXISTS ghosts_type_date_idx ON ${TDB}.ghosts (ghost_type, ghost_date)`,

  `CREATE TABLE IF NOT EXISTS ${TDB}.daily_results (
     user_id uuid, daily_date text, wins integer, losses integer,
     margin double precision, perfect boolean, box_json jsonb, roster_json jsonb,
     created_at timestamptz DEFAULT now(),
     PRIMARY KEY (user_id, daily_date))`,
  `CREATE INDEX IF NOT EXISTS daily_results_date_idx ON ${TDB}.daily_results (daily_date)`,

  `CREATE TABLE IF NOT EXISTS ${TDB}.private_tournaments (
     tournament_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name text, name_norm text, pin_hash text, pin_salt text,
     admin_user_id uuid, admin_name text, mode text, size integer,
     board_mode text, board_json jsonb, status text,
     created_at timestamptz DEFAULT now(), expires_at timestamptz, finalized_at timestamptz,
     final_bracket_json jsonb, champion_name text)`,
  `CREATE INDEX IF NOT EXISTS pt_name_norm_idx ON ${TDB}.private_tournaments (name_norm)`,

  `CREATE TABLE IF NOT EXISTS ${TDB}.private_entries (
     entry_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     tournament_id uuid, user_id uuid, user_name text, team_name text, status text,
     roster_json jsonb, sixth_json jsonb, roster_display jsonb,
     captain_slot integer, seed_net double precision, reg_w integer, reg_l integer,
     team_box_json jsonb,
     provisional_record_w integer, provisional_record_l integer, provisional_status text,
     final_record_w integer, final_record_l integer, final_status text,
     final_realized_margin double precision, final_reached_round integer,
     viewed_final_at timestamptz, created_at timestamptz DEFAULT now(), submitted_at timestamptz,
     UNIQUE (tournament_id, user_id))`,
  `CREATE INDEX IF NOT EXISTS pe_tournament_idx ON ${TDB}.private_entries (tournament_id)`,
  `CREATE INDEX IF NOT EXISTS pe_user_idx ON ${TDB}.private_entries (user_id)`,
];

/**
 * Create the tables + indexes if absent (the `tournament` schema is provisioned
 * separately — see SCHEMA_DDL note above). Idempotent and safe to call lazily once
 * per cold start: a module-level promise guards it so concurrent callers run it
 * exactly once (a failure clears the guard so a later call retries).
 */
export function ensureSchema(): Promise<void> {
  if (!globalThis.__oltp_schema__) {
    globalThis.__oltp_schema__ = (async () => {
      for (const stmt of SCHEMA_DDL) await queryRW(stmt);
    })().catch((err) => {
      globalThis.__oltp_schema__ = undefined; // allow retry on failure
      throw err;
    });
  }
  return globalThis.__oltp_schema__;
}
