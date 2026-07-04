import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Postgres executor so we can assert the SQL shape + param wiring of the
// durable store WITHOUT a live database. (The atomic behaviour itself is covered
// by the in-memory contract tests in authRateLimit.test.ts; here we verify the
// PG store issues the right atomic-upsert / select / delete statements.)
vi.mock("./oltpDb", () => ({
  queryRW: vi.fn(async () => []),
  TDB: "tournament",
}));

import { queryRW } from "./oltpDb";
import { pgThrottleStore, purgeExpiredThrottle } from "./authThrottleStore";

const CFG = { windowMs: 600_000, maxFails: 8, baseLockMs: 30_000, maxLockMs: 600_000 };

describe("PgThrottleStore.registerFailure (atomic upsert SQL contract)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("issues an INSERT … ON CONFLICT DO UPDATE … RETURNING with the count incremented in-SQL", async () => {
    vi.mocked(queryRW).mockResolvedValue([
      { fail_count: 3, window_start_ms: "1000", locked_until_ms: null },
    ]);
    await pgThrottleStore.registerFailure("user:bob", 1234, CFG);

    expect(queryRW).toHaveBeenCalledTimes(1);
    const [sql, params] = vi.mocked(queryRW).mock.calls[0];
    // Atomic upsert against the existing row (not a lockless read-modify-write).
    expect(sql).toContain("INSERT INTO tournament.auth_throttle");
    expect(sql).toContain("ON CONFLICT (throttle_key) DO UPDATE SET");
    expect(sql).toContain("t.fail_count + 1"); // increment references the stored row
    expect(sql).toContain("RETURNING fail_count, window_start_ms, locked_until_ms");
    // Param order: key, now, windowMs, maxFails, baseLockMs, maxLockMs.
    expect(params).toEqual([
      "user:bob",
      1234,
      CFG.windowMs,
      CFG.maxFails,
      CFG.baseLockMs,
      CFG.maxLockMs,
    ]);
  });

  it("parses the RETURNING row (bigint strings → numbers) into ThrottleState", async () => {
    vi.mocked(queryRW).mockResolvedValue([
      { fail_count: 9, window_start_ms: "5000", locked_until_ms: "65000" },
    ]);
    const state = await pgThrottleStore.registerFailure("k", 0, CFG);
    expect(state).toEqual({ failCount: 9, windowStartMs: 5000, lockedUntilMs: 65000 });
  });
});

describe("PgThrottleStore.peek", () => {
  beforeEach(() => vi.clearAllMocks());

  it("SELECTs the row and returns null when absent", async () => {
    vi.mocked(queryRW).mockResolvedValue([]);
    expect(await pgThrottleStore.peek("nope")).toBeNull();
    const [sql, params] = vi.mocked(queryRW).mock.calls[0];
    expect(sql).toContain("SELECT fail_count, window_start_ms, locked_until_ms");
    expect(sql).toContain("FROM tournament.auth_throttle");
    expect(params).toEqual(["nope"]);
  });

  it("maps a present row (null lock stays null)", async () => {
    vi.mocked(queryRW).mockResolvedValue([
      { fail_count: 2, window_start_ms: "10", locked_until_ms: null },
    ]);
    expect(await pgThrottleStore.peek("k")).toEqual({
      failCount: 2,
      windowStartMs: 10,
      lockedUntilMs: null,
    });
  });
});

describe("PgThrottleStore.clear", () => {
  beforeEach(() => vi.clearAllMocks());

  it("no-ops on an empty key list", async () => {
    await pgThrottleStore.clear([]);
    expect(queryRW).not.toHaveBeenCalled();
  });

  it("builds an IN clause with one placeholder per key", async () => {
    await pgThrottleStore.clear(["user:bob|ip:1.2.3.4", "user:bob"]);
    const [sql, params] = vi.mocked(queryRW).mock.calls[0];
    expect(sql).toContain("DELETE FROM tournament.auth_throttle WHERE throttle_key IN ($1, $2)");
    expect(params).toEqual(["user:bob|ip:1.2.3.4", "user:bob"]);
  });
});

describe("purgeExpiredThrottle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("DELETEs rows past their window whose lock has lifted, returning the count", async () => {
    vi.mocked(queryRW).mockResolvedValue([{ throttle_key: "a" }, { throttle_key: "b" }]);
    const purged = await purgeExpiredThrottle(1_000_000, 600_000);
    expect(purged).toBe(2);
    const [sql, params] = vi.mocked(queryRW).mock.calls[0];
    expect(sql).toContain("DELETE FROM tournament.auth_throttle");
    expect(sql).toContain("window_start_ms");
    expect(sql).toContain("locked_until_ms");
    expect(params).toEqual([1_000_000, 600_000]);
  });
});
