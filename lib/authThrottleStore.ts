import "server-only";
import { queryRW, withTx, ensureSchema, TDB } from "./oltpDb";
import {
  nextStateOnFailure,
  type ThrottleConfig,
  type ThrottleState,
  type ThrottleStore,
} from "./authRateLimit";

// Postgres-backed ThrottleStore (see lib/authRateLimit for the design + why this
// is durable/cross-instance rather than in-memory). Row shape: lib/oltpDb
// SCHEMA_DDL `auth_throttle`. Timestamps are epoch-ms bigints so the stored state
// uses the app clock the caller passes in.

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

class PgThrottleStore implements ThrottleStore {
  async get(key: string): Promise<ThrottleState | null> {
    await ensureSchema();
    const rows = await queryRW<ThrottleRow>(
      `SELECT fail_count, window_start_ms, locked_until_ms
         FROM ${TDB}.auth_throttle
        WHERE throttle_key = $1
        LIMIT 1`,
      [key],
    );
    return rows[0] ? toState(rows[0]) : null;
  }

  async recordFailure(
    key: string,
    nowMs: number,
    cfg: ThrottleConfig,
  ): Promise<ThrottleState> {
    await ensureSchema();
    // Row-lock the existing counter so concurrent attempts on the same key (even
    // on different instances) serialize — an attacker can't race past the cap. A
    // brand-new key has no row to lock; the ON CONFLICT resolves the rare
    // simultaneous-first-failure insert (a benign one-count undercount at worst).
    return withTx(async (client) => {
      const { rows } = await client.query<ThrottleRow>(
        `SELECT fail_count, window_start_ms, locked_until_ms
           FROM ${TDB}.auth_throttle
          WHERE throttle_key = $1
          FOR UPDATE`,
        [key],
      );
      const next = nextStateOnFailure(rows[0] ? toState(rows[0]) : null, nowMs, cfg);
      await client.query(
        `INSERT INTO ${TDB}.auth_throttle
           (throttle_key, fail_count, window_start_ms, locked_until_ms, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (throttle_key) DO UPDATE SET
           fail_count = EXCLUDED.fail_count,
           window_start_ms = EXCLUDED.window_start_ms,
           locked_until_ms = EXCLUDED.locked_until_ms,
           updated_at = now()`,
        [key, next.failCount, next.windowStartMs, next.lockedUntilMs],
      );
      return next;
    });
  }

  async clear(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await ensureSchema();
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    await queryRW(
      `DELETE FROM ${TDB}.auth_throttle WHERE throttle_key IN (${placeholders})`,
      keys,
    );
  }
}

/** The process-wide Postgres throttle store used by the real auth path. */
export const pgThrottleStore: ThrottleStore = new PgThrottleStore();
