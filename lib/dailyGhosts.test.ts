import { describe, expect, it } from "vitest";
import { buildDailyGhosts, DAILY_GHOST_COUNT } from "./dailyGhosts";
import type { DailyBoard } from "./daily";
import type { IndexedPlayer } from "./queries";

// Minimal IndexedPlayer with a real b-ref `pos` so canPlay is deterministic.
let counter = 0;
function mkPlayer(team: string, decade: number, pos: string): IndexedPlayer {
  counter += 1;
  return {
    entity_id: `e${counter}`,
    player_name: `Player ${counter}`,
    team,
    decade,
    best_season: decade + 5,
    value: 0.6,
    gp: 70, mpg: 32,
    pts: 20, reb: 6, ast: 5, stl: 1, blk: 0.5,
    fga: 15, fg3a: 4, fg3m: 1.5, fta: 5, tov: 2, fgm: 7, ftm: 4,
    tsplus: 1, height_in: 79, pos, all_def: 0, debut: decade + 2,
  };
}

// Board slots are [G, FLEX, W, FLEX, B] + a bench; every slot is a DISTINCT team
// (the real board never repeats a team), so the six are automatically distinct.
const board: DailyBoard = {
  slots: [
    { team: "AAA", decade: 1990 },
    { team: "BBB", decade: 1980 },
    { team: "CCC", decade: 2000 },
    { team: "DDD", decade: 2010 },
    { team: "EEE", decade: 1970 },
  ],
  benchSlot: { team: "FFF", decade: 1960 },
};

function fullIndex(): IndexedPlayer[] {
  return [
    // G slot — guards
    mkPlayer("AAA", 1990, "G"), mkPlayer("AAA", 1990, "G"),
    // FLEX
    mkPlayer("BBB", 1980, "G-F"), mkPlayer("BBB", 1980, "F"),
    // W slot — wings
    mkPlayer("CCC", 2000, "F"), mkPlayer("CCC", 2000, "F"),
    // FLEX
    mkPlayer("DDD", 2010, "F-C"), mkPlayer("DDD", 2010, "C"),
    // B slot — bigs
    mkPlayer("EEE", 1970, "C"), mkPlayer("EEE", 1970, "C"),
    // bench
    mkPlayer("FFF", 1960, "G"), mkPlayer("FFF", 1960, "F"),
    // noise from teams not on the board (must never be picked)
    mkPlayer("ZZZ", 1990, "G"),
  ];
}

describe("buildDailyGhosts", () => {
  it("produces a full field whose picks match the board exactly", () => {
    const ghosts = buildDailyGhosts(board, fullIndex(), "2026-06-05");
    expect(ghosts).toHaveLength(DAILY_GHOST_COUNT);

    const boardKeys = new Set(
      board.slots.map((s) => `${s.team}|${s.decade}`),
    );
    for (const g of ghosts) {
      // 5 starters occupy lineup positions 0..4.
      expect([...g.roster.map((p) => p.slot)].sort()).toEqual([0, 1, 2, 3, 4]);
      // the five starters' (team, decade) equal the board's five slots as a set.
      const keys = g.roster.map((p) => `${p.team}|${p.decade}`);
      expect(new Set(keys)).toEqual(boardKeys);
      // sixth man from the bench slot.
      expect(g.sixth.team).toBe(board.benchSlot!.team);
      expect(g.sixth.decade).toBe(board.benchSlot!.decade);
      // six distinct players (distinct teams ⇒ distinct entity_ids).
      const ids = [...g.roster.map((p) => p.entity_id), g.sixth.entity_id];
      expect(new Set(ids).size).toBe(6);
      expect(Number.isFinite(g.seedNet)).toBe(true);
    }
  });

  it("is deterministic per date and varies by date", () => {
    const index = fullIndex(); // one fixed index so only the date seed varies
    const a = buildDailyGhosts(board, index, "2026-06-05");
    const b = buildDailyGhosts(board, index, "2026-06-05");
    const c = buildDailyGhosts(board, index, "2026-06-06");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it("returns [] when a slot has no eligible player or the board is sparse", () => {
    // No big for the B slot → can't fill it.
    const noBig = fullIndex().filter((p) => !(p.team === "EEE"));
    expect(buildDailyGhosts(board, noBig, "2026-06-05")).toEqual([]);
    // Missing bench slot.
    expect(
      buildDailyGhosts({ slots: board.slots, benchSlot: null }, fullIndex(), "2026-06-05"),
    ).toEqual([]);
  });
});
