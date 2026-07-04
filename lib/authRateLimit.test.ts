import { describe, it, expect } from "vitest";
import {
  InMemoryThrottleStore,
  attemptKeys,
  attemptDelayMs,
  guardAttempt,
  checkThrottle,
  recordFailure,
  recordSuccess,
  nextStateOnFailure,
  lockRemainingMs,
  DEFAULT_THROTTLE,
  type ThrottleConfig,
  type DelayConfig,
} from "./authRateLimit";

// A tight config so the tests read clearly: lock after 3 fails, 1s base lock,
// 4s cap, 10s window.
const CFG: ThrottleConfig = {
  windowMs: 10_000,
  maxFails: 3,
  baseLockMs: 1_000,
  maxLockMs: 4_000,
};
// No-op sleep so guardAttempt never actually waits in tests.
const noSleep = async () => {};

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

describe("attemptKeys (layered, anti-grief keying)", () => {
  it("with an IP: hard-locks per-IP + (subject+IP); delays the global name; clears subject (not IP) on success", () => {
    const k = attemptKeys("user:bob", "1.2.3.4");
    expect(k.hardGate).toEqual(["user:bob|ip:1.2.3.4", "ip:1.2.3.4"]);
    expect(k.delayKey).toBe("user:bob");
    expect(k.fail).toEqual(["user:bob|ip:1.2.3.4", "ip:1.2.3.4", "user:bob"]);
    expect(k.subject).toEqual(["user:bob|ip:1.2.3.4", "user:bob"]);
    // The shared IP bucket is NOT in the subject set → a success never clears it.
    expect(k.subject).not.toContain("ip:1.2.3.4");
  });

  it("without an IP: NO hard lock (grief-free) — only the per-name delay key", () => {
    const k = attemptKeys("user:bob", null);
    expect(k.hardGate).toEqual([]);
    expect(k.delayKey).toBe("user:bob");
    expect(k.fail).toEqual(["user:bob"]);
    expect(k.subject).toEqual(["user:bob"]);
  });

  it("the global-name key is present in every attempt so a rotated IP can't dodge it", () => {
    // Two different IPs guessing the same name share the SAME delayKey/global fail
    // key, so the escalating per-name delay accumulates regardless of the IP.
    const a = attemptKeys("user:victim", "9.9.9.9");
    const b = attemptKeys("user:victim", "1.1.1.1");
    expect(a.delayKey).toBe(b.delayKey);
    expect(a.fail).toContain("user:victim");
    expect(b.fail).toContain("user:victim");
    // …but the hard-lock composites differ, so a remote attacker can't hard-lock
    // the victim's IP-scoped bucket.
    expect(a.hardGate[0]).not.toBe(b.hardGate[0]);
  });
});

describe("attemptDelayMs (grief-free per-name brake)", () => {
  const DCFG: DelayConfig = { freeAttempts: 2, baseDelayMs: 100, maxDelayMs: 800 };
  it("is 0 within the free-attempt budget", () => {
    expect(attemptDelayMs(null, DCFG)).toBe(0);
    expect(attemptDelayMs({ failCount: 2, windowStartMs: 0, lockedUntilMs: null }, DCFG)).toBe(0);
  });
  it("escalates (doubles) past the budget and caps at maxDelayMs", () => {
    const at = (n: number) =>
      attemptDelayMs({ failCount: n, windowStartMs: 0, lockedUntilMs: null }, DCFG);
    expect(at(3)).toBe(100); // 1st over
    expect(at(4)).toBe(200);
    expect(at(5)).toBe(400);
    expect(at(6)).toBe(800);
    expect(at(7)).toBe(800); // capped
  });
});

describe("throttle store contract (atomic increment / cap enforcement)", () => {
  it("cap enforcement uses the returned count from the atomic increment", async () => {
    const store = new InMemoryThrottleStore();
    let last = await store.registerFailure("k", 0, CFG); // 1
    expect(last.failCount).toBe(1);
    expect(last.lockedUntilMs).toBeNull();
    await store.registerFailure("k", 0, CFG); // 2
    last = await store.registerFailure("k", 0, CFG); // 3 == cap
    expect(last.failCount).toBe(3);
    expect(last.lockedUntilMs).not.toBeNull();
  });

  it("concurrent first-inserts do NOT collapse the count (race-safe increment)", async () => {
    const store = new InMemoryThrottleStore();
    // A lockless read-modify-write would undercount (all read 0 → all write 1).
    // The atomic contract must land at exactly N. (The PG store meets this via an
    // `ON CONFLICT DO UPDATE SET fail_count = fail_count + 1` upsert.)
    await Promise.all(
      Array.from({ length: 5 }, () => store.registerFailure("fresh", 0, CFG)),
    );
    expect((await store.peek("fresh"))?.failCount).toBe(5);
  });

  it("resets the SUBJECT on success but LEAVES the shared IP bucket (P1#3)", async () => {
    const store = new InMemoryThrottleStore();
    const keys = attemptKeys("user:bob", "1.2.3.4");
    await recordFailure(store, keys.fail, 0, CFG);
    await recordFailure(store, keys.fail, 0, CFG);
    await recordSuccess(store, keys.subject);
    expect(await store.peek("user:bob|ip:1.2.3.4")).toBeNull();
    expect(await store.peek("user:bob")).toBeNull();
    // The IP anti-spray history survives to age out on its own window.
    expect((await store.peek("ip:1.2.3.4"))?.failCount).toBe(2);
  });
});

describe("guardAttempt", () => {
  it("blocks when a hard-lock key is locked (429 path)", async () => {
    const store = new InMemoryThrottleStore();
    const keys = attemptKeys("user:bob", "1.2.3.4");
    for (let i = 0; i < CFG.maxFails; i++) await recordFailure(store, keys.fail, 0, CFG);
    const decision = await guardAttempt(store, keys, { nowMs: 0, cfg: CFG, sleep: noSleep });
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterMs).toBe(CFG.baseLockMs);
  });

  it("frees the attempt once the lock elapses", async () => {
    const store = new InMemoryThrottleStore();
    const keys = attemptKeys("user:bob", "1.2.3.4");
    for (let i = 0; i < CFG.maxFails; i++) await recordFailure(store, keys.fail, 0, CFG);
    const d = await guardAttempt(store, keys, {
      nowMs: CFG.baseLockMs + 1,
      cfg: CFG,
      sleep: noSleep,
    });
    expect(d.allowed).toBe(true);
  });

  it("applies the escalating per-name DELAY (not a lock) even with NO IP", async () => {
    const store = new InMemoryThrottleStore();
    const keys = attemptKeys("user:bob", null); // no hard-lock keys
    const DCFG: DelayConfig = { freeAttempts: 1, baseDelayMs: 10, maxDelayMs: 40 };
    // Drive the name key up.
    for (let i = 0; i < 4; i++) await recordFailure(store, keys.fail, 0, CFG);
    const slept: number[] = [];
    const decision = await guardAttempt(store, keys, {
      nowMs: 0,
      cfg: CFG,
      delayCfg: DCFG,
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
    // Never BLOCKED (grief-free), but it DID delay (bounds rotated-IP guessing).
    expect(decision.allowed).toBe(true);
    expect(slept.length).toBe(1);
    expect(slept[0]).toBeGreaterThan(0);
  });

  it("blocks if ANY hard-lock key (composite OR IP) is locked", async () => {
    const store = new InMemoryThrottleStore();
    for (let i = 0; i < CFG.maxFails; i++) await recordFailure(store, ["ip:1.2.3.4"], 0, CFG);
    const keys = attemptKeys("user:alice", "1.2.3.4");
    const d = await guardAttempt(store, keys, { nowMs: 0, cfg: CFG, sleep: noSleep });
    expect(d.allowed).toBe(false);
  });
});

describe("checkThrottle / recordFailure basics", () => {
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
