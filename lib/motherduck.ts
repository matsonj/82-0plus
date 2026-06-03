import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

// Cached MotherDuck connection. We stash the promise on globalThis so Next.js
// dev hot-reloads (which re-evaluate modules) reuse one connection per process,
// and Vercel Fluid Compute reuses it across warm invocations.
const DB_NAME = "nba_box_scores_v2";

declare global {
  // eslint-disable-next-line no-var
  var __md_conn__: Promise<DuckDBConnection> | undefined;
}

async function createConnection(): Promise<DuckDBConnection> {
  const token = process.env.MOTHERDUCK_TOKEN;
  if (!token) {
    throw new Error(
      "MOTHERDUCK_TOKEN is not set. Add it to .env.local (see .env.example).",
    );
  }
  const path = `md:${DB_NAME}?motherduck_token=${encodeURIComponent(token)}`;
  const instance = await DuckDBInstance.create(path);
  return instance.connect();
}

function getConnection(): Promise<DuckDBConnection> {
  if (!globalThis.__md_conn__) {
    globalThis.__md_conn__ = createConnection().catch((err) => {
      // Reset so the next request can retry instead of caching the failure.
      globalThis.__md_conn__ = undefined;
      throw err;
    });
  }
  return globalThis.__md_conn__;
}

function normalize(value: unknown): unknown {
  // DuckDB returns BIGINT as JS bigint; convert to number for JSON friendliness.
  if (typeof value === "bigint") return Number(value);
  return value;
}

export type QueryParam = string | number | null;

/** Run a read-only query. Params bind to `$1`, `$2`, ... in the SQL. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: QueryParam[] = [],
): Promise<T[]> {
  const conn = await getConnection();
  const reader =
    params.length > 0
      ? await conn.runAndReadAll(sql, params)
      : await conn.runAndReadAll(sql);
  return reader.getRowObjects().map((row) => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(row)) out[key] = normalize(row[key]);
    return out as T;
  });
}
