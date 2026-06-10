import { describe, expect, it } from "vitest";
import {
  buildPrivateBots,
  validateManualBoard,
  type PrivateBoard,
  type PrivateSlot,
} from "./privateBoard";
import type { IndexedPlayer } from "./queries";

// A legal six-team board: six distinct teams; the 1990s appears twice (allowed).
const legal: PrivateSlot[] = [
  { team: "CHI", decade: 1990 },
  { team: "UTA", decade: 1990 },
  { team: "LAL", decade: 1980 },
  { team: "BOS", decade: 1980 },
  { team: "SAS", decade: 2010 },
  { team: "GSW", decade: 2010 },
];

describe("validateManualBoard", () => {
  it("accepts a legal 6-team board", () => {
    const res = validateManualBoard(legal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.board.slots).toHaveLength(5);
      expect(res.board.benchSlot).toEqual({ team: "GSW", decade: 2010 });
      expect(res.board.mode).toBe("manual");
    }
  });

  it("rejects fewer than 6 slots", () => {
    const res = validateManualBoard(legal.slice(0, 5));
    expect(res.ok).toBe(false);
  });

  it("rejects more than 6 slots", () => {
    const res = validateManualBoard([...legal, { team: "MIA", decade: 2010 }]);
    expect(res.ok).toBe(false);
  });

  it("rejects duplicate teams", () => {
    const dup = [...legal];
    dup[1] = { team: "CHI", decade: 1980 }; // CHI repeated
    const res = validateManualBoard(dup);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/distinct/i);
  });

  it("rejects a decade appearing 3 times", () => {
    const triple: PrivateSlot[] = [
      { team: "CHI", decade: 1990 },
      { team: "UTA", decade: 1990 },
      { team: "NYK", decade: 1990 },
      { team: "BOS", decade: 1980 },
      { team: "SAS", decade: 2010 },
      { team: "GSW", decade: 2010 },
    ];
    const res = validateManualBoard(triple);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/twice/i);
  });

  it("accepts a decade appearing exactly twice", () => {
    // `legal` already has two 1980s and two 2010s — both at the cap.
    expect(validateManualBoard(legal).ok).toBe(true);
  });

  it("rejects a malformed slot (missing team / bad decade)", () => {
    const bad = [...legal];
    bad[0] = { team: "", decade: 1990 };
    expect(validateManualBoard(bad).ok).toBe(false);
  });
});

// ── Bots (pure, in-memory index — no DB) ──────────────────────────────────────

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
    tsplus: 1, height_in: 79, pos, all_def: 0,
  };
}

const board: PrivateBoard = {
  slots: [
    { team: "AAA", decade: 1990 },
    { team: "BBB", decade: 1980 },
    { team: "CCC", decade: 2000 },
    { team: "DDD", decade: 2010 },
    { team: "EEE", decade: 1970 },
  ],
  benchSlot: { team: "FFF", decade: 1960 },
  mode: "manual",
};

function fullIndex(): IndexedPlayer[] {
  return [
    mkPlayer("AAA", 1990, "G"), mkPlayer("AAA", 1990, "G"),
    mkPlayer("BBB", 1980, "G-F"), mkPlayer("BBB", 1980, "F"),
    mkPlayer("CCC", 2000, "F"), mkPlayer("CCC", 2000, "F"),
    mkPlayer("DDD", 2010, "F-C"), mkPlayer("DDD", 2010, "C"),
    mkPlayer("EEE", 1970, "C"), mkPlayer("EEE", 1970, "C"),
    mkPlayer("FFF", 1960, "G"), mkPlayer("FFF", 1960, "F"),
    mkPlayer("ZZZ", 1990, "G"), // noise — off-board team, never picked
  ];
}

describe("buildPrivateBots", () => {
  it("produces `count` bots whose picks match the board exactly", () => {
    const bots = buildPrivateBots(board, fullIndex(), "tourney-uuid", 4);
    expect(bots).toHaveLength(4);

    const boardKeys = new Set(board.slots.map((s) => `${s.team}|${s.decade}`));
    bots.forEach((bot, i) => {
      expect(bot.index).toBe(i);
      expect([...bot.roster.map((p) => p.slot)].sort()).toEqual([0, 1, 2, 3, 4]);
      const keys = bot.roster.map((p) => `${p.team}|${p.decade}`);
      expect(new Set(keys)).toEqual(boardKeys);
      expect(bot.sixth.team).toBe(board.benchSlot.team);
      expect(bot.sixth.decade).toBe(board.benchSlot.decade);
      const ids = [...bot.roster.map((p) => p.entity_id), bot.sixth.entity_id];
      expect(new Set(ids).size).toBe(6);
      expect(Number.isFinite(bot.seedNet)).toBe(true);
    });
  });

  it("is deterministic per seed and varies by seed", () => {
    const index = fullIndex();
    const a = buildPrivateBots(board, index, "seed-A", 3);
    const b = buildPrivateBots(board, index, "seed-A", 3);
    const c = buildPrivateBots(board, index, "seed-B", 3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it("uses per-index sub-streams (first N bots stable as count grows)", () => {
    const index = fullIndex();
    const three = buildPrivateBots(board, index, "seed-X", 3);
    const five = buildPrivateBots(board, index, "seed-X", 5);
    expect(JSON.stringify(five.slice(0, 3))).toBe(JSON.stringify(three));
  });

  it("returns [] when a starter slot has no eligible player", () => {
    const noBig = fullIndex().filter((p) => p.team !== "EEE");
    expect(buildPrivateBots(board, noBig, "seed", 3)).toEqual([]);
  });

  it("returns [] when the bench combo is empty", () => {
    const noBench = fullIndex().filter((p) => p.team !== "FFF");
    expect(buildPrivateBots(board, noBench, "seed", 3)).toEqual([]);
  });
});
