import { describe, it, expect, vi, beforeEach } from "vitest";

// The DAL is mocked: authenticate()'s create-or-match logic and its concurrency
// guard are what we're exercising, not the database. getUsersByName always returns
// [] (simulating the race window where neither concurrent caller sees the other's
// freshly inserted row), so a missing guard would INSERT once per call.
// dailyResults now reads the Postgres pool (lib/oltpDb), so mock THAT — otherwise
// ensureSchema() hits a real connection and the suite needs DATABASE_URL.
vi.mock("./oltpDb", () => ({
  queryRW: vi.fn(async () => []),
  ensureSchema: vi.fn(async () => {}),
}));
vi.mock("./tournamentQueries", () => ({
  getUsersByName: vi.fn(async () => []),
  insertUser: vi.fn(async () => "uid"),
}));

import { authenticate, listDailyResults } from "./dailyResults";
import * as q from "./tournamentQueries";
import * as db from "./oltpDb";

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
    const [a, b] = await Promise.all([
      authenticate("Bob", "1234"),
      authenticate("Bob", "1234"),
    ]);
    expect(q.insertUser).toHaveBeenCalledTimes(1);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.userId).toBe(b.userId);
  });

  it("normalizes the name before coalescing (same account)", async () => {
    const [a, b] = await Promise.all([
      authenticate("Bob", "1234"),
      authenticate("  bob  ", "1234"),
    ]);
    expect(q.insertUser).toHaveBeenCalledTimes(1);
    if (a.ok && b.ok) expect(a.userId).toBe(b.userId);
  });

  it("does not coalesce different PINs (distinct accounts)", async () => {
    await Promise.all([
      authenticate("Bob", "1234"),
      authenticate("Bob", "9999"),
    ]);
    expect(q.insertUser).toHaveBeenCalledTimes(2);
  });

  it("is single-flight, not a cache — a later login re-runs create-or-match", async () => {
    await authenticate("Bob", "1234");
    await authenticate("Bob", "1234");
    // getUsersByName still returns [] here, so the guard having been cleared means
    // the second (sequential) call inserts again rather than reusing a stale promise.
    expect(q.insertUser).toHaveBeenCalledTimes(2);
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
