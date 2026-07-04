import { describe, it, expect, vi, beforeEach } from "vitest";

// applyEntryFinals batches the finalize persistence (#109): instead of one
// UPDATE per bot-replaced entry + one UPDATE per resolved standing, it fires at
// most TWO statements total, both pinned to one backend via withTx (required
// under PgBouncer transaction-mode pooling). Mock ./oltpDb so this exercises the
// SQL-shaping logic without a real Postgres connection, and so a caller of
// withTx can't accidentally fall back to per-call pooling (queryRW) — asserting
// zero queryRW calls here would catch that regression.
const { queryFn, withTxMock } = vi.hoisted(() => {
  const queryFn = vi.fn(async (_sql: string, _params: unknown[]) => ({ rows: [] }));
  const withTxMock = vi.fn(async (fn: (client: { query: typeof queryFn }) => unknown) => {
    return fn({ query: queryFn });
  });
  return { queryFn, withTxMock };
});

vi.mock("./oltpDb", () => ({
  ensureSchema: vi.fn(async () => {}),
  queryRW: vi.fn(async () => []),
  withTx: withTxMock,
}));

import { applyEntryFinals } from "./privateTournamentQueries";
import * as oltpDb from "./oltpDb";

describe("applyEntryFinals (#109 batch persist)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is a no-op on empty input — never opens a transaction or emits a malformed query", async () => {
    await applyEntryFinals({ botReplacedEntryIds: [], results: [] });
    expect(withTxMock).not.toHaveBeenCalled();
    expect(queryFn).not.toHaveBeenCalled();
    expect(oltpDb.queryRW).not.toHaveBeenCalled();
  });

  it("batches bot-replaced flips into one ANY($1::uuid[]) UPDATE", async () => {
    await applyEntryFinals({
      botReplacedEntryIds: ["e1", "e2", "e3"],
      results: [],
    });
    expect(withTxMock).toHaveBeenCalledTimes(1);
    expect(queryFn).toHaveBeenCalledTimes(1);
    const [sql, params] = queryFn.mock.calls[0];
    expect(sql).toContain("SET status = 'bot_replaced'");
    expect(sql).toContain("WHERE entry_id = ANY($1::uuid[])");
    expect(params).toEqual([["e1", "e2", "e3"]]);
  });

  it("batches resolved standings into one UPDATE ... FROM (VALUES ...) with correctly-ordered params", async () => {
    await applyEntryFinals({
      botReplacedEntryIds: [],
      results: [
        {
          entryId: "e1",
          finalRecordW: 4,
          finalRecordL: 1,
          finalStatus: "Champion",
          finalRealizedMargin: 12.5,
          finalReachedRound: 5,
        },
        {
          entryId: "e2",
          finalRecordW: 2,
          finalRecordL: 3,
          finalStatus: "Lost Play-In",
          finalRealizedMargin: -3.25,
          finalReachedRound: 0,
        },
      ],
    });
    expect(withTxMock).toHaveBeenCalledTimes(1);
    expect(queryFn).toHaveBeenCalledTimes(1);
    const [sql, params] = queryFn.mock.calls[0];
    expect(sql).toContain("FROM (VALUES");
    expect(sql).toContain("t.entry_id = v.entry_id::uuid");
    // 2 rows * 6 columns = 12 positional params, in row-major order.
    expect(params).toEqual([
      "e1",
      4,
      1,
      "Champion",
      12.5,
      5,
      "e2",
      2,
      3,
      "Lost Play-In",
      -3.25,
      0,
    ]);
  });

  it("runs both the bot-replaced flip and the standings write in the SAME transaction", async () => {
    await applyEntryFinals({
      botReplacedEntryIds: ["e1"],
      results: [
        {
          entryId: "e2",
          finalRecordW: 1,
          finalRecordL: 4,
          finalStatus: "Lost Round 1",
          finalRealizedMargin: -8,
          finalReachedRound: 1,
        },
      ],
    });
    expect(withTxMock).toHaveBeenCalledTimes(1);
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(queryFn.mock.calls[0][0]).toContain("bot_replaced");
    expect(queryFn.mock.calls[1][0]).toContain("FROM (VALUES");
  });
});
