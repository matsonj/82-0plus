import "server-only";
import { Pool, types } from "pg";

// Dedicated READ-ONLY pool for the public tournament read paths
// (/api/tournament/{bracket,team,lookup}). It uses its OWN low-privilege token,
// `MOTHERDUCK_TOURNAMENT_RO_TOKEN`, scoped to the tournament data (via a MotherDuck
// share) — NOT the app-wide `MOTHERDUCK_TOKEN` that also serves the anonymous
// NBA-data endpoints, and NOT the RW token.
//
// Why a separate token: the lookup path reads the auth table
// (`users.pin_hash`/`pin_salt`). If that read ran on the general read token, a
// leak of that token — or any future arbitrary-read bug on the NBA-data path —
// would become an offline brute-force vector against the 4–6 digit PINs. Keeping a
// purpose-scoped RO token means: a leak of any OTHER token can't reach the auth
// table, and a leak of THIS token can't write.
//
// Mirrors lib/tournamentDb.ts (a single cached pool, fully-qualified names against
// the default `md:` workspace) but the token is read-only.

types.setTypeParser(20, (v) => parseInt(v, 10)); // int8 / bigint
types.setTypeParser(1700, (v) => parseFloat(v)); // numeric

const PG_HOST =
  process.env.MOTHERDUCK_PG_HOST ?? "pg.us-east-1-aws.motherduck.com";
const PG_POOL_MAX = parsePositiveInt(
  process.env.MOTHERDUCK_TOURNAMENT_RO_POOL_MAX,
  2,
);

declare global {
  // eslint-disable-next-line no-var
  var __md_tournament_ro_pool__: Pool | undefined;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Resolve the read-only tournament token. Production REQUIRES the dedicated
 *  `MOTHERDUCK_TOURNAMENT_RO_TOKEN` so the public read path is never backed by a
 *  write-capable or broadly-scoped credential. Outside production we fall back to
 *  the RW token (whose account owns `nba_tournament` directly) so local dev needn't
 *  provision a separate token + share. */
function resolveToken(): string {
  const ro = process.env.MOTHERDUCK_TOURNAMENT_RO_TOKEN;
  if (ro) return ro;
  if (process.env.NODE_ENV !== "production" && process.env.MOTHERDUCK_RW_TOKEN) {
    return process.env.MOTHERDUCK_RW_TOKEN;
  }
  throw new Error(
    "MOTHERDUCK_TOURNAMENT_RO_TOKEN is not set. Add it to .env.local (see .env.example) " +
      "— a read-only token scoped to the tournament share for the public read paths.",
  );
}

function getPool(): Pool {
  if (globalThis.__md_tournament_ro_pool__) {
    return globalThis.__md_tournament_ro_pool__;
  }
  const pool = new Pool({
    host: PG_HOST,
    port: 5432,
    user: "postgres",
    password: resolveToken(),
    database: "md:",
    ssl: { rejectUnauthorized: true },
    max: PG_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  globalThis.__md_tournament_ro_pool__ = pool;
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
