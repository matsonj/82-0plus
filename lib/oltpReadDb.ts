import "server-only";
import { Pool, types } from "pg";
import { cleanConnString } from "./oltpDb";

// READ-ONLY pool for the public tournament read paths
// (/api/tournament/{bracket,team,lookup}). Same Postgres store as lib/oltpDb.ts,
// but a SEPARATE, lower-privilege connection that never runs DDL or writes.
//
// Blast-radius posture (carried over from the MotherDuck design): the lookup path
// reads the auth table (users.pin_hash / pin_salt), so a leak of this token must
// not become an offline brute-force vector against the 4–6 digit PINs across the
// wider anonymous read surface. Point `DATABASE_URL_RO` at a dedicated PlanetScale
// role with SELECT-only grants on the `tournament` schema. If unset, it falls back
// to DATABASE_URL so the app runs with a single connection string and the role can
// be tightened later as an env-only change. Unlike the old MotherDuck share, both
// paths now hit the same always-on database — no ~1-min replication lag.

types.setTypeParser(20, (v) => parseInt(v, 10)); // int8 / bigint
types.setTypeParser(1700, (v) => parseFloat(v)); // numeric
// No oid-1114 override: the schema uses timestamptz (1184), parsed natively.

const POOL_MAX = parsePositiveInt(process.env.OLTP_PG_RO_POOL_MAX, 5);

declare global {
  // eslint-disable-next-line no-var
  var __oltp_ro_pool__: Pool | undefined;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getPool(): Pool {
  if (globalThis.__oltp_ro_pool__) return globalThis.__oltp_ro_pool__;
  const connectionString =
    process.env.DATABASE_URL_RO || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "No connection string for tournament reads. Set DATABASE_URL (or a dedicated " +
        "read-only DATABASE_URL_RO) — see .env.example.",
    );
  }
  const pool = new Pool({
    connectionString: cleanConnString(connectionString),
    ssl: { rejectUnauthorized: true },
    max: POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  globalThis.__oltp_ro_pool__ = pool;
  return pool;
}

export type QueryParam = string | number | boolean | null;

/** Run a read-only tournament query. Params bind to `$1`, `$2`, … */
export async function queryTournamentRO<T = Record<string, unknown>>(
  sql: string,
  params: QueryParam[] = [],
): Promise<T[]> {
  const res = await getPool().query(sql, params);
  return res.rows as T[];
}
