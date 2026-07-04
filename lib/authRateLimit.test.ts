import { describe, it, expect } from "vitest";
import {
  InMemoryThrottleStore,
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
    // A failure after the window closes starts over at 1.
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

describe("throttle flow over a store", () => {
  it("allows attempts until the cap, then locks (lockout after N fails)", async () => {
    const store = new InMemoryThrottleStore();
    const keys = ["user:bob"];
    // 2 fails: still allowed.
    await recordFailure(store, keys, 0, CFG);
    await recordFailure(store, keys, 0, CFG);
    expect((await checkThrottle(store, keys, 0)).allowed).toBe(true);
    // 3rd fail trips the lock.
    await recordFailure(store, keys, 0, CFG);
    const gate = await checkThrottle(store, keys, 0);
    expect(gate.allowed).toBe(false);
    expect(gate.retryAfterMs).toBe(CFG.baseLockMs);
  });

  it("resets on success (a hit clears the counter)", async () => {
    const store = new InMemoryThrottleStore();
    const keys = ["user:bob"];
    await recordFailure(store, keys, 0, CFG);
    await recordFailure(store, keys, 0, CFG);
    await recordSuccess(store, keys);
    // Post-reset, three MORE fails are needed to lock again.
    await recordFailure(store, keys, 0, CFG);
    await recordFailure(store, keys, 0, CFG);
    expect((await checkThrottle(store, keys, 0)).allowed).toBe(true);
  });

  it("frees the attempt once the lock elapses", async () => {
    const store = new InMemoryThrottleStore();
    const keys = ["user:bob"];
    for (let i = 0; i < CFG.maxFails; i++) await recordFailure(store, keys, 0, CFG);
    expect((await checkThrottle(store, keys, 0)).allowed).toBe(false);
    // After the base lock passes, attempts are allowed again.
    expect((await checkThrottle(store, keys, CFG.baseLockMs + 1)).allowed).toBe(true);
  });

  it("blocks if ANY key (account OR IP) is locked", async () => {
    const store = new InMemoryThrottleStore();
    // Lock only the IP key; a request carrying both keys is still blocked.
    for (let i = 0; i < CFG.maxFails; i++) {
      await recordFailure(store, ["ip:1.2.3.4"], 0, CFG);
    }
    const gate = await checkThrottle(store, ["user:alice", "ip:1.2.3.4"], 0);
    expect(gate.allowed).toBe(false);
  });

  it("keeps distinct keys independent", async () => {
    const store = new InMemoryThrottleStore();
    for (let i = 0; i < CFG.maxFails; i++) await recordFailure(store, ["user:bob"], 0, CFG);
    // A different account is unaffected.
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
