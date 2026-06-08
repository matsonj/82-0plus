import "server-only";
import { Pool, types } from "pg";

// READ-ONLY pool for the public tournament read paths
// (/api/tournament/{bracket,team,lookup}). It is its OWN pg pool on a read-only
// token — NOT the RW pool — and it never runs DDL. The token resolves to a
// DEDICATED `MOTHERDUCK_TOURNAMENT_RO_TOKEN` if set, otherwise the app-wide
// `MOTHERDUCK_TOKEN`. Either way, the owner attaches a read-only copy/share of
// `nba_tournament` to whichever token's instance this resolves to.
//
// On the dedicated-token tradeoff: the lookup path reads the auth table
// (`users.pin_hash`/`pin_salt`). Sharing one token with the anonymous NBA-data
// endpoints means a leak of that token (or an arbitrary-read bug on that wide
// public surface) becomes an offline brute-force vector against the 4–6 digit
// PINs. Setting `MOTHERDUCK_TOURNAMENT_RO_TOKEN` to a purpose-scoped token shrinks
// that blast radius. It's optional — the fallback to `MOTHERDUCK_TOKEN` keeps ops
// simple for low-stakes deployments, and tightening later is an env-only change.
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

/** Resolve the read-only tournament token: a dedicated
 *  `MOTHERDUCK_TOURNAMENT_RO_TOKEN` if provided (tightest blast radius), else the
 *  app-wide read token `MOTHERDUCK_TOKEN`. The owner attaches a read-only copy of
 *  `nba_tournament` to whichever token's instance this resolves to. (In local dev,
 *  if only the RW token is set, fall back to it so the app runs without extra
 *  setup — the RW account owns `nba_tournament` directly.) */
function resolveToken(): string {
  const token =
    process.env.MOTHERDUCK_TOURNAMENT_RO_TOKEN || process.env.MOTHERDUCK_TOKEN;
  if (token) return token;
  if (process.env.NODE_ENV !== "production" && process.env.MOTHERDUCK_RW_TOKEN) {
    return process.env.MOTHERDUCK_RW_TOKEN;
  }
  throw new Error(
    "No read token for tournament reads. Set MOTHERDUCK_TOKEN (or a dedicated " +
      "MOTHERDUCK_TOURNAMENT_RO_TOKEN) — see .env.example.",
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
