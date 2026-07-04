import { describe, it, expect } from "vitest";
import {
  InMemoryThrottleStore,
  attemptKeys,
  checkThrottle,
  recordFailure,
  recordSuccess,
  nextStateOnFailure,
  lockRemainingMs,
  DEFAULT_THROTTLE,
  type ThrottleConfig,
} from "./authRateLimit";

// A tight config so the tests read clearly: lock after 3 fails, 1s base lock,
// 4s cap, 10s window.
const CFG: ThrottleConfig = {
  windowMs: 10_000,
  maxFails: 3,
  baseLockMs: 1_000,
  maxLockMs: 4_000,
};

describe("nextStateOnFailure (pure window/cap/escalation logic)", () => {
  it("starts a fresh window on the first failure", () => {
    const s = nextStateOnFailure(null, 1_000, CFG);
    expect(s).toEqual({ failCount: 1, windowStartMs: 1_000, lockedUntilMs: null });
  });

  it("accumulates within a window and does not lock below the cap", () => {
    let s = nextStateOnFailure(null, 0, CFG);
    s = nextStateOnFailure(s, 100, CFG);
    expect(s.failCount).toBe(2);
    expect(s.lockedUntilMs).toBeNull();
  });

  it("locks once the cap is reached", () => {
    let s = nextStateOnFailure(null, 0, CFG); // 1
    s = nextStateOnFailure(s, 100, CFG); // 2
    s = nextStateOnFailure(s, 200, CFG); // 3 == cap
    expect(s.failCount).toBe(3);
    expect(s.lockedUntilMs).toBe(200 + CFG.baseLockMs);
  });

  it("escalates the lock (doubling) on each failure past the cap, capped at maxLockMs", () => {
    let s = nextStateOnFailure(null, 0, CFG); // 1
    s = nextStateOnFailure(s, 0, CFG); // 2
    s = nextStateOnFailure(s, 0, CFG); // 3 → base (1000)
    expect(s.lockedUntilMs).toBe(1_000);
    s = nextStateOnFailure(s, 0, CFG); // 4 → 2×base (2000)
    expect(s.lockedUntilMs).toBe(2_000);
    s = nextStateOnFailure(s, 0, CFG); // 5 → 4×base (4000)
    expect(s.lockedUntilMs).toBe(4_000);
    s = nextStateOnFailure(s, 0, CFG); // 6 → 8×base capped at maxLockMs (4000)
    expect(s.lockedUntilMs).toBe(4_000);
  });

  it("resets the counter once the window has fully elapsed", () => {
    let s = nextStateOnFailure(null, 0, CFG);
    s = nextStateOnFailure(s, 100, CFG);
    const fresh = nextStateOnFailure(s, CFG.windowMs + 1, CFG);
    expect(fresh).toEqual({
      failCount: 1,
      windowStartMs: CFG.windowMs + 1,
      lockedUntilMs: null,
    });
  });
});

describe("lockRemainingMs", () => {
  it("is 0 for no state or an unlocked state", () => {
    expect(lockRemainingMs(null, 5)).toBe(0);
    expect(lockRemainingMs({ failCount: 1, windowStartMs: 0, lockedUntilMs: null }, 5)).toBe(0);
  });
  it("reports the remaining lock and never goes negative", () => {
    const state = { failCount: 3, windowStartMs: 0, lockedUntilMs: 1_000 };
    expect(lockRemainingMs(state, 400)).toBe(600);
    expect(lockRemainingMs(state, 2_000)).toBe(0);
  });
});

describe("attemptKeys (anti-grief keying)", () => {
  it("with an IP: gates on the (subject+IP) composite AND the per-IP key; success clears only the composite", () => {
    const k = attemptKeys("user:bob", "1.2.3.4");
    expect(k.gate).toEqual(["user:bob|ip:1.2.3.4", "ip:1.2.3.4"]);
    expect(k.subject).toEqual(["user:bob|ip:1.2.3.4"]);
    // The shared IP bucket is NOT in the subject set, so a success never clears it.
    expect(k.subject).not.toContain("ip:1.2.3.4");
  });

  it("without an IP: falls back to a bare per-name key (documented residual grief)", () => {
    const k = attemptKeys("user:bob", null);
    expect(k.gate).toEqual(["user:bob"]);
    expect(k.subject).toEqual(["user:bob"]);
  });

  it("scopes the name to the attacker's IP so a REMOTE attacker can't lock a victim", () => {
    const attacker = attemptKeys("user:victim", "9.9.9.9");
    const victim = attemptKeys("user:victim", "1.1.1.1");
    // The victim's own composite key is different from the attacker's, so
    // failures the attacker racks up never appear in the victim's bucket.
    expect(attacker.gate[0]).not.toBe(victim.gate[0]);
  });
});

describe("throttle store contract (atomic increment / cap enforcement)", () => {
  it("allows attempts until the cap, then locks (lockout after N fails)", async () => {
    const store = new InMemoryThrottleStore();
    const keys = ["user:bob"];
    await recordFailure(store, keys, 0, CFG);
    await recordFailure(store, keys, 0, CFG);
    expect((await checkThrottle(store, keys, 0)).allowed).toBe(true);
    await recordFailure(store, keys, 0, CFG);
    const gate = await checkThrottle(store, keys, 0);
    expect(gate.allowed).toBe(false);
    expect(gate.retryAfterMs).toBe(CFG.baseLockMs);
  });

  it("cap enforcement uses the returned count from the atomic increment", async () => {
    const store = new InMemoryThrottleStore();
    // registerFailure RETURNS the post-increment state; the lock is decided from it.
    let last = await store.registerFailure("k", 0, CFG); // 1
    expect(last.failCount).toBe(1);
    expect(last.lockedUntilMs).toBeNull();
    last = await store.registerFailure("k", 0, CFG); // 2
    last = await store.registerFailure("k", 0, CFG); // 3 == cap
    expect(last.failCount).toBe(3);
    expect(last.lockedUntilMs).not.toBeNull();
  });

  it("concurrent first-inserts do NOT collapse the count (race-safe increment)", async () => {
    const store = new InMemoryThrottleStore();
    // Fire N failures at a brand-new key simultaneously. A lockless
    // read-modify-write would undercount (all read 0 → all write 1). The atomic
    // contract must land at exactly N. (The PG store meets this via an
    // `ON CONFLICT DO UPDATE SET fail_count = fail_count + 1` upsert.)
    await Promise.all(
      Array.from({ length: 5 }, () => store.registerFailure("fresh", 0, CFG)),
    );
    const state = await store.peek("fresh");
    expect(state?.failCount).toBe(5);
  });

  it("resets the SUBJECT on success but LEAVES the shared IP bucket (P1#3)", async () => {
    const store = new InMemoryThrottleStore();
    const { gate, subject } = attemptKeys("user:bob", "1.2.3.4");
    // Two misses hit both the composite and the IP key.
    await recordFailure(store, gate, 0, CFG);
    await recordFailure(store, gate, 0, CFG);
    // A good login clears only the subject (composite)…
    await recordSuccess(store, subject);
    expect(await store.peek("user:bob|ip:1.2.3.4")).toBeNull();
    // …the IP anti-spray history survives to age out on its own window.
    expect((await store.peek("ip:1.2.3.4"))?.failCount).toBe(2);
  });

  it("frees the attempt once the lock elapses", async () => {
    const store = new InMemoryThrottleStore();
    const keys = ["user:bob"];
    for (let i = 0; i < CFG.maxFails; i++) await recordFailure(store, keys, 0, CFG);
    expect((await checkThrottle(store, keys, 0)).allowed).toBe(false);
    expect((await checkThrottle(store, keys, CFG.baseLockMs + 1)).allowed).toBe(true);
  });

  it("blocks if ANY gate key (composite OR IP) is locked", async () => {
    const store = new InMemoryThrottleStore();
    // Lock only the IP key; a request carrying both keys is still blocked.
    for (let i = 0; i < CFG.maxFails; i++) {
      await recordFailure(store, ["ip:1.2.3.4"], 0, CFG);
    }
    const gate = await checkThrottle(store, ["user:alice|ip:1.2.3.4", "ip:1.2.3.4"], 0);
    expect(gate.allowed).toBe(false);
  });

  it("keeps distinct keys independent", async () => {
    const store = new InMemoryThrottleStore();
    for (let i = 0; i < CFG.maxFails; i++) await recordFailure(store, ["user:bob"], 0, CFG);
    expect((await checkThrottle(store, ["user:carol"], 0)).allowed).toBe(true);
  });
});

describe("DEFAULT_THROTTLE", () => {
  it("is lenient enough that a single new-user miss never locks", () => {
    const s = nextStateOnFailure(null, Date.now(), DEFAULT_THROTTLE);
    expect(s.failCount).toBe(1);
    expect(s.lockedUntilMs).toBeNull();
    expect(DEFAULT_THROTTLE.maxFails).toBeGreaterThan(1);
  });
});
