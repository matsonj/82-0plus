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

import { authenticate } from "./dailyResults";
import * as q from "./tournamentQueries";

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
