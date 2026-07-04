import "server-only";
import { queryRW, TDB } from "./oltpDb";
import {
  type ThrottleConfig,
  type ThrottleState,
  type ThrottleStore,
} from "./authRateLimit";

// Postgres-backed ThrottleStore (see lib/authRateLimit for the design + why this
// is durable/cross-instance/atomic). Row shape: lib/oltpDb SCHEMA_DDL
// `auth_throttle`. Timestamps are epoch-ms bigints so the stored state uses the
// app clock the caller passes in.
//
// NARROW WRITER (#122 review P2#4): these methods NEVER run schema DDL. The table
// is provisioned by the authenticated paths' ensureSchema() (which includes
// auth_throttle) — those run on essentially every account/daily/tournament op —
// so a warm instance always has it. The PUBLIC lookup routes therefore trigger
// only minimal read/writes here, never DDL, and wrap these calls to fail-open (a
// not-yet-provisioned table or a transient blip must not 500 a public read).

interface ThrottleRow {
  fail_count: number;
  window_start_ms: number;
  locked_until_ms: number | null;
}

function toState(row: ThrottleRow): ThrottleState {
  return {
    failCount: row.fail_count,
    windowStartMs: Number(row.window_start_ms),
    lockedUntilMs: row.locked_until_ms == null ? null : Number(row.locked_until_ms),
  };
}

// One ATOMIC upsert = one failed attempt. Postgres holds the row lock for the
// duration of the ON CONFLICT DO UPDATE, and the SET references the EXISTING row
// (t.fail_count + 1), so concurrent attempts serialize and the count is exact —
// two simultaneous first-inserts resolve to 2, never collapse to 1. The window
// reset + escalating lock are computed inline so the whole decision is atomic and
// mirrors nextStateOnFailure() in lib/authRateLimit. Params:
//   $1 key  $2 now(ms)  $3 windowMs  $4 maxFails  $5 baseLockMs  $6 maxLockMs
const REGISTER_FAILURE_SQL = `
  INSERT INTO ${TDB}.auth_throttle AS t
    (throttle_key, fail_count, window_start_ms, locked_until_ms, updated_at)
  VALUES ($1, 1, $2, NULL, now())
  ON CONFLICT (throttle_key) DO UPDATE SET
    fail_count = CASE
      WHEN $2 - t.window_start_ms >= $3 THEN 1
      ELSE t.fail_count + 1 END,
    window_start_ms = CASE
      WHEN $2 - t.window_start_ms >= $3 THEN $2
      ELSE t.window_start_ms END,
    locked_until_ms = CASE
      WHEN $2 - t.window_start_ms >= $3 THEN NULL
      WHEN t.fail_count + 1 >= $4
        THEN $2 + LEAST(
               ($5 * power(2, LEAST(t.fail_count + 1 - $4, 20)))::bigint,
               $6::bigint)
      ELSE t.locked_until_ms END,
    updated_at = now()
  RETURNING fail_count, window_start_ms, locked_until_ms`;

class PgThrottleStore implements ThrottleStore {
  async peek(key: string): Promise<ThrottleState | null> {
    const rows = await queryRW<ThrottleRow>(
      `SELECT fail_count, window_start_ms, locked_until_ms
         FROM ${TDB}.auth_throttle
        WHERE throttle_key = $1
        LIMIT 1`,
      [key],
    );
    return rows[0] ? toState(rows[0]) : null;
  }

  async registerFailure(
    key: string,
    nowMs: number,
    cfg: ThrottleConfig,
  ): Promise<ThrottleState> {
    const rows = await queryRW<ThrottleRow>(REGISTER_FAILURE_SQL, [
      key,
      nowMs,
      cfg.windowMs,
      cfg.maxFails,
      cfg.baseLockMs,
      cfg.maxLockMs,
    ]);
    return toState(rows[0]);
  }

  async clear(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    await queryRW(
      `DELETE FROM ${TDB}.auth_throttle WHERE throttle_key IN (${placeholders})`,
      keys,
    );
  }
}

/** The process-wide Postgres throttle store used by the real auth path. */
export const pgThrottleStore: ThrottleStore = new PgThrottleStore();

/**
 * Delete throttle rows whose window has fully elapsed and whose lock (if any) has
 * lifted — so public misses can't create durable rows forever. Wired into the
 * daily rebuild cron. Returns the number of rows removed. `nowMs`/`windowMs`
 * default to real time and the default window.
 */
export async function purgeExpiredThrottle(
  nowMs: number = Date.now(),
  windowMs = 10 * 60_000,
): Promise<number> {
  const rows = await queryRW<{ throttle_key: string }>(
    `DELETE FROM ${TDB}.auth_throttle
      WHERE $1 - window_start_ms >= $2
        AND (locked_until_ms IS NULL OR locked_until_ms <= $1)
      RETURNING throttle_key`,
    [nowMs, windowMs],
  );
  return rows.length;
}
