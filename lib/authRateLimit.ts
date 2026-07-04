// Failed-credential throttle for the arcade (name + PIN) auth path (#107).
//
// Threat model. The PIN is 4–6 digits, so an unthrottled endpoint is cheap to
// brute-force, and authenticate() CREATES an account on a credential miss — so an
// unthrottled miss path is also an unbounded row-creation vector. This limiter
// lives INSIDE the single auth path (lib/dailyResults authenticate /
// findExistingUserByCredentials, plus the two name+PIN lookup routes) so every
// caller is covered by construction.
//
// Durability + atomicity. Vercel Fluid Compute runs multiple instances with no
// shared memory, so a purely in-memory counter is per-instance best-effort — an
// attacker who spreads guesses across warm instances would evade it. This limiter
// is therefore backed by the always-warm OLTP Postgres, and the increment is a
// SINGLE atomic upsert (`fail_count = fail_count + 1` referencing the existing
// row under Postgres' row lock) — NOT a lockless read-modify-write. That makes the
// counter correct under concurrency (concurrent first-inserts resolve to 2, not 1
// via ON CONFLICT) and across instances, so the cap can't be raced past: once the
// atomic increment sets `locked_until`, every later attempt is gated on that
// committed value. (The pre-attempt gate is a plain read of that atomically-
// maintained lock — a burst arriving at exactly count-1 all pass one attempt each,
// then the lock trips; that residual is bounded by instance concurrency and is
// inherent to any check-then-verify limiter.)
//
// Anti-grief keying. Names are public, so a GLOBAL per-name lock would let anyone
// lock a victim out. See attemptKeys(): the per-IP key is the primary brake, and
// the per-name key is scoped to (name + IP) so a remote attacker can't lock a
// victim's name from arbitrary IPs. A successful login clears ONLY the subject
// (name/name+IP) key — never the shared per-IP bucket, so one good login can't
// wipe an IP's anti-spray history.
//
// The decision logic (window / cap / escalating lock) is a pure function reused by
// the in-memory store; the Postgres store's SQL upsert mirrors it exactly.

/** A stored throttle counter for one key (a subject or a client IP). */
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
// subject counter, so normal play never approaches the cap.
export const DEFAULT_THROTTLE: ThrottleConfig = {
  windowMs: 10 * 60_000, // 10 minutes
  maxFails: 8, // 8 misses per window before the first lock
  baseLockMs: 30_000, // 30s lock on the first trip
  maxLockMs: 10 * 60_000, // capped at 10 minutes
};

// Exponent cap for the escalating lock (mirrors the SQL's LEAST(..., 20)) so the
// doubling can never overflow before maxLockMs clamps it.
const MAX_ESCALATION_STEP = 20;

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
 *
 * This is the REFERENCE spec; the Postgres store's atomic upsert reproduces it in
 * SQL, and the in-memory store calls it directly.
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
    const over = Math.min(failCount - cfg.maxFails, MAX_ESCALATION_STEP); // 0, 1, 2, …
    const lockMs = Math.min(cfg.baseLockMs * 2 ** over, cfg.maxLockMs);
    lockedUntilMs = nowMs + lockMs;
  }
  return { failCount, windowStartMs: prev.windowStartMs, lockedUntilMs };
}

/** Backing store for throttle counters (Postgres in prod, in-memory in tests). */
export interface ThrottleStore {
  /** Read current state (for the pre-attempt lock gate). */
  peek(key: string): Promise<ThrottleState | null>;
  /** Atomically fold one failure into `key` and return the resulting state. */
  registerFailure(key: string, nowMs: number, cfg: ThrottleConfig): Promise<ThrottleState>;
  /** Clear the counters for `keys` (called after a successful auth). */
  clear(keys: string[]): Promise<void>;
}

/** The outcome of a pre-attempt throttle check. */
export interface ThrottleDecision {
  allowed: boolean;
  /** When blocked, ms the caller should wait before retrying. */
  retryAfterMs: number;
}

/** Gate + subject keys for one credential attempt (see attemptKeys). */
export interface AttemptKeys {
  /** Keys to gate on / record failures against (subject + IP). */
  gate: string[];
  /** Keys to CLEAR on success — the subject only, never the shared IP bucket. */
  subject: string[];
}

/**
 * Build the throttle keys for an attempt against `subject` (e.g. `user:<name>` or
 * `pt:<name>`) from `ip`.
 *
 *  - With an IP: gate on BOTH a per-IP key (the primary brake — bounds an
 *    attacker's total attempts from one address across all names) AND a
 *    (subject+IP) composite (finer per-name limiting that a REMOTE attacker cannot
 *    use to lock a victim, since it's always scoped to the attacker's own IP).
 *    Success clears only the composite, leaving the IP bucket to age out.
 *  - Without an IP (should be rare on Vercel — x-real-ip is platform-set): fall
 *    back to a bare per-name key. This is the one case a name can be griefed;
 *    documented as a residual tradeoff.
 */
export function attemptKeys(subject: string, ip: string | null): AttemptKeys {
  if (ip) {
    const composite = `${subject}|ip:${ip}`;
    return { gate: [composite, `ip:${ip}`], subject: [composite] };
  }
  return { gate: [subject], subject: [subject] };
}

/**
 * Gate an auth attempt: blocked if ANY gate key is currently locked. Returns the
 * longest remaining lock so the caller can surface a single Retry-After.
 */
export async function checkThrottle(
  store: ThrottleStore,
  gateKeys: string[],
  nowMs: number = Date.now(),
): Promise<ThrottleDecision> {
  let retryAfterMs = 0;
  for (const key of gateKeys) {
    const state = await store.peek(key);
    retryAfterMs = Math.max(retryAfterMs, lockRemainingMs(state, nowMs));
  }
  return { allowed: retryAfterMs === 0, retryAfterMs };
}

/** Record a failed attempt against every gate key (atomic per key). */
export async function recordFailure(
  store: ThrottleStore,
  gateKeys: string[],
  nowMs: number = Date.now(),
  cfg: ThrottleConfig = DEFAULT_THROTTLE,
): Promise<void> {
  for (const key of gateKeys) await store.registerFailure(key, nowMs, cfg);
}

/** Reset the SUBJECT keys after a verified success (never the shared IP bucket). */
export async function recordSuccess(
  store: ThrottleStore,
  subjectKeys: string[],
): Promise<void> {
  await store.clear(subjectKeys);
}

/**
 * A process-local ThrottleStore for unit tests (and a best-effort fallback). Its
 * registerFailure is a synchronous read-modify-write with no `await` between the
 * read and the write, so it is atomic under JS's single-threaded model — a
 * Promise.all() of concurrent failures increments correctly (matching the
 * Postgres store's atomic-upsert contract). NOT durable across instances.
 */
export class InMemoryThrottleStore implements ThrottleStore {
  private map = new Map<string, ThrottleState>();

  async peek(key: string): Promise<ThrottleState | null> {
    return this.map.get(key) ?? null;
  }

  async registerFailure(
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
