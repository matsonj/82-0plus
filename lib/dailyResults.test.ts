import { describe, it, expect, vi, beforeEach } from "vitest";

// The DAL is mocked: authenticate()'s create-or-match logic and its concurrency
// guard are what we're exercising, not the database. getUsersByName always returns
// [] (simulating the race window where neither concurrent caller sees the other's
// freshly inserted row), so a missing guard would INSERT once per call.
// dailyResults now reads the Postgres pool (lib/oltpDb), so mock THAT — otherwise
// ensureSchema() hits a real connection and the suite needs DATABASE_URL. The
// throttle is injected per-call (opts.throttleStore) with an in-memory store, so
// the durable Postgres throttle path is never touched here.
vi.mock("./oltpDb", () => ({
  queryRW: vi.fn(async () => []),
  ensureSchema: vi.fn(async () => {}),
  // authThrottleStore reads TDB at module-eval time to build its SQL; the tests
  // inject an in-memory throttle store so the queryRW/DDL path is never exercised.
  TDB: "tournament",
}));
vi.mock("./tournamentQueries", () => ({
  getUsersByName: vi.fn(async () => []),
  insertUser: vi.fn(async () => "uid"),
}));

import { authenticate } from "./dailyResults";
import { InMemoryThrottleStore } from "./authRateLimit";
import { hashPin } from "./pinHash";
import * as q from "./tournamentQueries";

// A fresh in-memory throttle store per call keeps each authenticate() independent
// (no cross-test lock accumulation) unless a test deliberately shares one.
const freshStore = () => new InMemoryThrottleStore();

describe("authenticate concurrency guard (#31)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(q.getUsersByName).mockResolvedValue([]);
    let n = 0;
    // A small delay keeps both concurrent calls in flight simultaneously, and a
    // unique id per insert lets us prove both callers resolve to the SAME account.
    vi.mocked(q.insertUser).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return `uid-${++n}`;
    });
  });

  it("coalesces concurrent first-time logins into one account", async () => {
    const throttleStore = freshStore();
    const [a, b] = await Promise.all([
      authenticate("Bob", "1234", { throttleStore }),
      authenticate("Bob", "1234", { throttleStore }),
    ]);
    expect(q.insertUser).toHaveBeenCalledTimes(1);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.userId).toBe(b.userId);
  });

  it("normalizes the name before coalescing (same account)", async () => {
    const throttleStore = freshStore();
    const [a, b] = await Promise.all([
      authenticate("Bob", "1234", { throttleStore }),
      authenticate("  bob  ", "1234", { throttleStore }),
    ]);
    expect(q.insertUser).toHaveBeenCalledTimes(1);
    if (a.ok && b.ok) expect(a.userId).toBe(b.userId);
  });

  it("does not coalesce different PINs (distinct accounts)", async () => {
    const throttleStore = freshStore();
    await Promise.all([
      authenticate("Bob", "1234", { throttleStore }),
      authenticate("Bob", "9999", { throttleStore }),
    ]);
    expect(q.insertUser).toHaveBeenCalledTimes(2);
  });

  it("is single-flight, not a cache — a later login re-runs create-or-match", async () => {
    const throttleStore = freshStore();
    await authenticate("Bob", "1234", { throttleStore });
    await authenticate("Bob", "1234", { throttleStore });
    // getUsersByName still returns [] here, so the guard having been cleared means
    // the second (sequential) call inserts again rather than reusing a stale promise.
    expect(q.insertUser).toHaveBeenCalledTimes(2);
  });
});

describe("authenticate rate limiting (#107)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(q.getUsersByName).mockResolvedValue([]);
    let n = 0;
    vi.mocked(q.insertUser).mockImplementation(async () => `uid-${++n}`);
  });

  // No-op sleep so the escalating per-name delay never actually waits in tests.
  const noSleep = async () => {};

  it("locks out the create-on-miss path via the per-IP hard lock (bounds account spam)", async () => {
    const throttleStore = freshStore();
    const ip = "198.51.100.4";
    // Every distinct PIN misses → creates an account (a miss for the throttle).
    // From one IP the per-IP hard-lock trips at the default cap, then rejects.
    let lockedAt = 0;
    for (let i = 0; i < 30; i++) {
      const res = await authenticate("Spammer", String(1000 + i), { throttleStore, ip, sleep: noSleep });
      if (!res.ok) {
        lockedAt = i;
        expect(res.retryAfterMs).toBeGreaterThan(0);
        break;
      }
    }
    expect(lockedAt).toBeGreaterThan(0);
    // Once locked, no further accounts are minted from that IP.
    const created = vi.mocked(q.insertUser).mock.calls.length;
    await authenticate("Spammer", "7777", { throttleStore, ip, sleep: noSleep });
    expect(vi.mocked(q.insertUser).mock.calls.length).toBe(created);
  });

  it("threads the IP: success clears the (name+IP) subject but NOT the shared IP bucket", async () => {
    const throttleStore = new InMemoryThrottleStore();
    const { pinHash, pinSalt } = hashPin("1234");
    vi.mocked(q.getUsersByName).mockResolvedValue([
      { user_id: "alice", pin_hash: pinHash, pin_salt: pinSalt },
    ]);
    const ip = "203.0.113.7";
    // A couple of wrong-PIN misses from this IP…
    await authenticate("Alice", "0001", { throttleStore, ip, sleep: noSleep });
    await authenticate("Alice", "0002", { throttleStore, ip, sleep: noSleep });
    // …then a correct login.
    const ok = await authenticate("Alice", "1234", { throttleStore, ip, sleep: noSleep });
    expect(ok.ok).toBe(true);
    // The subject (name+IP composite AND the global name) counters are cleared…
    expect(await throttleStore.peek(`user:alice|ip:${ip}`)).toBeNull();
    expect(await throttleStore.peek("user:alice")).toBeNull();
    // …but the per-IP anti-spray bucket retains its failures (ages out on its own).
    expect((await throttleStore.peek(`ip:${ip}`))?.failCount).toBe(2);
  });

  it("with NO IP, the per-name brake is a DELAY (never a hard lockout / 429)", async () => {
    const throttleStore = freshStore();
    // No ip → no hard-lock keys. Many misses must NOT produce a 429 (grief-free);
    // the protection is the escalating delay (skipped here) + scrypt.
    let everBlocked = false;
    for (let i = 0; i < 20; i++) {
      const res = await authenticate("Target", String(2000 + i), { throttleStore, sleep: noSleep });
      if (!res.ok) everBlocked = true;
    }
    expect(everBlocked).toBe(false);
  });
});
