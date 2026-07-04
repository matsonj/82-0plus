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

import { authenticate, listDailyResults } from "./dailyResults";
import { InMemoryThrottleStore } from "./authRateLimit";
import { hashPin } from "./pinHash";
import * as q from "./tournamentQueries";
import * as db from "./oltpDb";

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

// The champion match runs server-side in SQL (string_agg over the roster), so there
// is no live DB in the unit suite. These lock the two things a JS test CAN prove
// about #110's decorrelation: (1) the emitted query resolves champion in one pass —
// no per-row correlated subquery — and its roster signature is order-independent on
// BOTH sides (so a matching roster is credited regardless of pick order and a
// near-miss is not); (2) the boolean the query returns is passed through untouched.
describe("listDailyResults champion decorrelation (#110)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.queryRW).mockResolvedValue([]);
  });

  function sqlOf(): string {
    return vi.mocked(db.queryRW).mock.calls[0][0] as string;
  }

  it("resolves champion in a single pass — no per-row correlated subquery", async () => {
    await listDailyResults("uid", "2026-06-01");
    const sql = sqlOf();
    // Decorrelated shape: signatures built once (mine / team_sigs) then matched by a
    // single JOIN, earliest entry kept via DISTINCT ON — not a subquery correlated
    // to the outer row's user_id.
    expect(sql).toContain("DISTINCT ON");
    expect(sql).toMatch(/JOIN\s+team_sigs/);
    expect(sql).not.toContain("t.user_id = r.user_id");
    // reached_round = 4 is still what "champion" means.
    expect(sql).toContain("reached_round = 4");
  });

  it("compares an order-independent signature on BOTH rosters", async () => {
    await listDailyResults("uid", "2026-06-01");
    const sql = sqlOf();
    // Both the recorded roster (roster_json) and the entered team roster
    // (roster_display -> 'roster') aggregate with the SAME sorted key, so pick order
    // never affects the match.
    expect(sql).toContain("r.roster_json");
    expect(sql).toContain("roster_display -> 'roster'");
    // string_agg(...) with an ORDER BY on the same key = order-independent signature.
    const sigMatches = sql.match(/string_agg\([\s\S]*?ORDER BY[\s\S]*?\)/g) ?? [];
    expect(sigMatches.length).toBe(2);
    // Empty/absent rosters coalesce to '[]' and aggregate to NULL (never a match),
    // so an empty roster is never crowned champion.
    expect(sql).toContain("'[]'::jsonb");
  });

  it("passes the SQL-computed champion boolean straight through", async () => {
    // A day the SQL matched to a bracket winner (champion true) and one it did not
    // (near-miss / no matching entry → false). The mapping must not alter either.
    vi.mocked(db.queryRW).mockResolvedValue([
      { daily_date: "2026-06-02", wins: 82, losses: 0, margin: 12, perfect: true, champion: true, top10: true },
      { daily_date: "2026-06-01", wins: 60, losses: 22, margin: 3, perfect: false, champion: false, top10: false },
    ] as never);
    const out = await listDailyResults("uid", "2026-06-01");
    expect(out.map((r) => [r.date, r.champion])).toEqual([
      ["2026-06-02", true],
      ["2026-06-01", false],
    ]);
  });

  it("parameterizes the since floor (no value interpolation)", async () => {
    await listDailyResults("uid", "2026-06-01");
    expect(vi.mocked(db.queryRW).mock.calls[0][1]).toEqual(["uid", "2026-06-01"]);
    expect(sqlOf()).toContain("$2");

    vi.clearAllMocks();
    vi.mocked(db.queryRW).mockResolvedValue([]);
    await listDailyResults("uid");
    expect(vi.mocked(db.queryRW).mock.calls[0][1]).toEqual(["uid"]);
    // With no floor there is no $2 to bind.
    expect(sqlOf()).not.toContain("$2");
  });
});
