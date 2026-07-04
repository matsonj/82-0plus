// Failed-credential throttle for the arcade (name + PIN) auth path (#107).
//
// Threat model. The PIN is 4–6 digits, so an unthrottled endpoint is cheap to
// brute-force, and authenticate() CREATES an account on a credential miss — so an
// unthrottled miss path is also an unbounded row-creation vector. This limiter
// lives INSIDE the single auth path (lib/dailyResults authenticate /
// findExistingUserByCredentials, plus the two name+PIN lookup routes) so every
// caller is covered by construction.
//
// Durability. Vercel Fluid Compute runs multiple instances with no shared memory,
// so a purely in-memory counter is per-instance best-effort — an attacker who
// spreads guesses across warm instances would evade it. This limiter is therefore
// backed by the always-warm OLTP Postgres (the same store the accounts live in),
// keyed by a small `auth_throttle` table, so the counter is correct across
// instances. The per-attempt cost is one indexed SELECT on success (+ a DELETE to
// reset) and one short row-locked upsert transaction on a failure — negligible at
// arcade-auth volumes.
//
// The decision logic (window / cap / escalating lock) is pure and unit-tested
// (authRateLimit.test.ts) against an in-memory store; the Postgres store is a thin
// adapter that applies the same pure functions under a row lock.

/** A stored throttle counter for one key (an account name or a client IP). */
export interface ThrottleState {
  /** Failures counted in the current window. */
  failCount: number;
  /** Epoch ms the current counting window began. */
  windowStartMs: number;
  /** Epoch ms a lock lifts, or null when not locked. */
  lockedUntilMs: number | null;
}

export interface ThrottleConfig {
  /** How long a counting window lasts before failures age out. */
  windowMs: number;
  /** Failures within a window that trip a lock. */
  maxFails: number;
  /** Lock length the first time the cap is hit. */
  baseLockMs: number;
  /** Ceiling for the escalating lock. */
  maxLockMs: number;
}

// Defaults tuned to kill cheap brute-force without punishing real players. A
// legitimate user costs at most ONE failure (their first-ever login creates the
// account, which counts as a miss); every later login is a hit that RESETS the
// counter, so normal play never approaches the cap. An attacker guessing PINs (or
// spamming account creation) trips the cap and then faces an escalating lock.
export const DEFAULT_THROTTLE: ThrottleConfig = {
  windowMs: 10 * 60_000, // 10 minutes
  maxFails: 8, // 8 misses per window before the first lock
  baseLockMs: 30_000, // 30s lock on the first trip
  maxLockMs: 10 * 60_000, // capped at 10 minutes
};

/** Milliseconds until a locked key frees up (0 when not locked). */
export function lockRemainingMs(
  state: ThrottleState | null,
  nowMs: number,
): number {
  if (!state || state.lockedUntilMs == null) return 0;
  return Math.max(0, state.lockedUntilMs - nowMs);
}

/**
 * Fold one failure into a key's state. A fully-elapsed window resets the counter
 * (so sporadic misspellings never accumulate into a lock). At/over the cap the
 * lock escalates — each additional failure doubles the lock, capped at maxLockMs —
 * so a persistent guesser is pushed to ever-longer waits.
 */
export function nextStateOnFailure(
  prev: ThrottleState | null,
  nowMs: number,
  cfg: ThrottleConfig = DEFAULT_THROTTLE,
): ThrottleState {
  if (!prev || nowMs - prev.windowStartMs >= cfg.windowMs) {
    return { failCount: 1, windowStartMs: nowMs, lockedUntilMs: null };
  }
  const failCount = prev.failCount + 1;
  let lockedUntilMs = prev.lockedUntilMs ?? null;
  if (failCount >= cfg.maxFails) {
    const over = failCount - cfg.maxFails; // 0, 1, 2, … past the cap
    const lockMs = Math.min(cfg.baseLockMs * 2 ** over, cfg.maxLockMs);
    lockedUntilMs = nowMs + lockMs;
  }
  return { failCount, windowStartMs: prev.windowStartMs, lockedUntilMs };
}

/** Backing store for throttle counters (Postgres in prod, in-memory in tests). */
export interface ThrottleStore {
  get(key: string): Promise<ThrottleState | null>;
  /** Apply one failure to `key` atomically and return the resulting state. */
  recordFailure(key: string, nowMs: number, cfg: ThrottleConfig): Promise<ThrottleState>;
  /** Clear the counters for `keys` (called after a successful auth). */
  clear(keys: string[]): Promise<void>;
}

/** The outcome of a pre-attempt throttle check. */
export interface ThrottleDecision {
  allowed: boolean;
  /** When blocked, ms the caller should wait before retrying. */
  retryAfterMs: number;
}

/**
 * Gate an auth attempt: blocked if ANY of `keys` (typically the account name AND
 * the client IP) is currently locked. Returns the longest remaining lock so the
 * caller can surface a single Retry-After.
 */
export async function checkThrottle(
  store: ThrottleStore,
  keys: string[],
  nowMs: number = Date.now(),
): Promise<ThrottleDecision> {
  let retryAfterMs = 0;
  for (const key of keys) {
    const state = await store.get(key);
    retryAfterMs = Math.max(retryAfterMs, lockRemainingMs(state, nowMs));
  }
  return { allowed: retryAfterMs === 0, retryAfterMs };
}

/** Record a failed attempt against every key (account + IP). */
export async function recordFailure(
  store: ThrottleStore,
  keys: string[],
  nowMs: number = Date.now(),
  cfg: ThrottleConfig = DEFAULT_THROTTLE,
): Promise<void> {
  for (const key of keys) await store.recordFailure(key, nowMs, cfg);
}

/** Reset every key after a verified success. */
export async function recordSuccess(
  store: ThrottleStore,
  keys: string[],
): Promise<void> {
  await store.clear(keys);
}

/**
 * A process-local ThrottleStore for unit tests (and a best-effort fallback). NOT
 * durable across instances — the Postgres store is what production uses.
 */
export class InMemoryThrottleStore implements ThrottleStore {
  private map = new Map<string, ThrottleState>();

  async get(key: string): Promise<ThrottleState | null> {
    return this.map.get(key) ?? null;
  }

  async recordFailure(
    key: string,
    nowMs: number,
    cfg: ThrottleConfig,
  ): Promise<ThrottleState> {
    const next = nextStateOnFailure(this.map.get(key) ?? null, nowMs, cfg);
    this.map.set(key, next);
    return next;
  }

  async clear(keys: string[]): Promise<void> {
    for (const key of keys) this.map.delete(key);
  }
}
