import { Pool, types } from "pg";

// MotherDuck's PostgreSQL wire endpoint — a pure-JS driver, so there are no
// native binaries to bundle (works cleanly on Vercel). It still runs DuckDB SQL.
// https://motherduck.com/docs/sql-reference/postgres-endpoint/

// DuckDB/PG numeric types arrive as strings by default; coerce to JS numbers.
types.setTypeParser(20, (v) => parseInt(v, 10)); // int8 / bigint (counts)
types.setTypeParser(1700, (v) => parseFloat(v)); // numeric

const PG_HOST =
  process.env.MOTHERDUCK_PG_HOST ?? "pg.us-east-1-aws.motherduck.com";

declare global {
  // eslint-disable-next-line no-var
  var __md_pool__: Pool | undefined;
}

function getPool(): Pool {
  if (!globalThis.__md_pool__) {
    const token = process.env.MOTHERDUCK_TOKEN;
    if (!token) {
      throw new Error(
        "MOTHERDUCK_TOKEN is not set. Add it to .env.local (see .env.example).",
      );
    }
    // Connect to the default workspace ("md:") and reference the database with
    // fully-qualified names — read-only tokens can't change the active workspace.
    globalThis.__md_pool__ = new Pool({
      host: PG_HOST,
      port: 5432,
      user: "postgres",
      password: token,
      database: "md:",
      ssl: { rejectUnauthorized: true },
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });
  }
  return globalThis.__md_pool__;
}

export type QueryParam = string | number | null;

/** Run a read-only query. Params bind to `$1`, `$2`, ... in the SQL. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: QueryParam[] = [],
): Promise<T[]> {
  const res = await getPool().query(sql, params);
  return res.rows as T[];
}
