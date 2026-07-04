import { describe, it, expect, vi, beforeEach } from "vitest";

// submitPrivateEntry must PERSIST roster_json (the five starters) alongside
// sixth_json. The direct registered→submit path never saves a partial, so without
// this a submitted entry would have a null roster_json — leaving finalize with no
// stored roster to re-hydrate for degrade detection (#104). Mock ./oltpDb so this
// exercises the SQL/params shaping without a real Postgres connection.
const { queryRWMock } = vi.hoisted(() => ({
  queryRWMock: vi.fn(async (_sql: string, _params: unknown[]) => [
    { entry_id: "e1" }, // non-empty ⇒ the UPDATE matched an in-progress row (ok)
  ]),
}));

vi.mock("./oltpDb", () => ({
  ensureSchema: vi.fn(async () => {}),
  queryRW: queryRWMock,
  withTx: vi.fn(),
}));

import { submitPrivateEntry } from "./privateTournamentQueries";

describe("submitPrivateEntry persists roster_json", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes roster_json AND sixth_json so every submitted entry has its stored roster", async () => {
    const picks = [
      { entity_id: "p0", team: "T0", decade: 1990, slot: 0 },
      { entity_id: "p1", team: "T1", decade: 1990, slot: 1 },
    ];
    const sixth = { entity_id: "p6", team: "TB", decade: 1990 };

    const out = await submitPrivateEntry({
      entryId: "e1",
      rosterJson: picks,
      sixthJson: sixth,
      captainSlot: 0,
      rosterDisplay: { roster: [], sixthMan: {} },
      provisionalRecordW: 3,
      provisionalRecordL: 2,
      provisionalStatus: "Lost Round 1",
      teamName: "MY TEAM",
    });

    expect(out).toEqual({ ok: true });
    expect(queryRWMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryRWMock.mock.calls[0];
    // The UPDATE sets roster_json, and it is the first bound value after entryId.
    expect(sql).toContain("roster_json = $2");
    expect(sql).toContain("sixth_json = $3");
    expect(params[0]).toBe("e1");
    expect(params[1]).toBe(JSON.stringify(picks)); // the five starters, persisted
    expect(params[2]).toBe(JSON.stringify(sixth));
  });
});
