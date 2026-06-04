import { Pool, types } from "pg";

// MotherDuck's PostgreSQL wire endpoint — a pure-JS driver, so there are no
// native binaries to bundle (works cleanly on Vercel). It still runs DuckDB SQL.
// https://motherduck.com/docs/sql-reference/postgres-endpoint/

// DuckDB/PG numeric types arrive as strings by default; coerce to JS numbers.
types.setTypeParser(20, (v) => parseInt(v, 10)); // int8 / bigint (counts)
types.setTypeParser(1700, (v) => parseFloat(v)); // numeric

const PG_HOST =
  process.env.MOTHERDUCK_PG_HOST ?? "pg.us-east-1-aws.motherduck.com";
const PG_POOL_MAX = parsePositiveInt(process.env.MOTHERDUCK_PG_POOL_MAX, 4);
const PG_POOL_CACHE_MAX = parsePositiveInt(
  process.env.MOTHERDUCK_PG_POOL_CACHE_MAX,
  32,
);

export interface QueryOptions {
  sessionHint?: string;
}

interface PoolEntry {
  pool: Pool;
  lastUsed: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __md_pools__: Map<string, PoolEntry> | undefined;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildDatabase(sessionHint: string | undefined): string {
  // MotherDuck parses the PG "database" startup value as the md: connection
  // string, so this is where read-scaling affinity belongs for node-postgres.
  return sessionHint
    ? `md:?session_hint=${encodeURIComponent(sessionHint)}`
    : "md:";
}

function getPool(options: QueryOptions = {}): Pool {
  const token = process.env.MOTHERDUCK_TOKEN;
  if (!token) {
    throw new Error(
      "MOTHERDUCK_TOKEN is not set. Add it to .env.local (see .env.example).",
    );
  }

  const sessionHint = options.sessionHint;
  const key = sessionHint ?? "__default__";
  const pools = (globalThis.__md_pools__ ??= new Map());
  const existing = pools.get(key);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.pool;
  }

  if (pools.size >= PG_POOL_CACHE_MAX) {
    const [oldestKey, oldest] = [...pools.entries()].sort(
      (a, b) => a[1].lastUsed - b[1].lastUsed,
    )[0];
    pools.delete(oldestKey);
    void oldest.pool.end().catch(() => {});
  }

  // Connect to the default workspace ("md:") and reference the database with
  // fully-qualified names — read-only tokens can't change the active workspace.
  const pool = new Pool({
    host: PG_HOST,
    port: 5432,
    user: "postgres",
    password: token,
    database: buildDatabase(sessionHint),
    ssl: { rejectUnauthorized: true },
    max: PG_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  pools.set(key, { pool, lastUsed: Date.now() });
  return pool;
}

export type QueryParam = string | number | null;

/** Run a read-only query. Params bind to `$1`, `$2`, ... in the SQL. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: QueryParam[] = [],
  options: QueryOptions = {},
): Promise<T[]> {
  const res = await getPool(options).query(sql, params);
  return res.rows as T[];
}
