import { describe, it, expect } from "vitest";
import {
  planFinalField,
  statusLabel,
  startersMatchBoard,
  reservedBotName,
  genericBotName,
  type FieldPlanEntry,
} from "./privateTournamentRun";
import type { PrivateSize } from "./privateTournament";
import type { PrivateBoard } from "./privateBoard";
import type { BracketResult, BracketTeam, SeriesResult, SimPick } from "./types";

// ── Fixtures ───────────────────────────────────────────────────────────────

let nextEntry = 0;
function entry(over: Partial<FieldPlanEntry> = {}): FieldPlanEntry {
  const n = nextEntry++;
  return {
    entryId: over.entryId ?? `e${n}`,
    userId: over.userId ?? `u${n}`,
    userName: over.userName ?? `USER${n}`,
    teamName: over.teamName ?? null,
    status: over.status ?? "submitted",
  };
}

// ── planFinalField ───────────────────────────────────────────────────────────

describe("planFinalField", () => {
  it("all-submitted => all human slots, total === size", () => {
    const size: PrivateSize = 4;
    const entries = [entry(), entry(), entry(), entry()];
    const plan = planFinalField(entries, size);
    expect(plan).toHaveLength(size);
    expect(plan.every((s) => s.kind === "human")).toBe(true);
  });

  it("reserved-incomplete (registered/partial) become {USERNAME} BOT", () => {
    const size: PrivateSize = 4;
    const a = entry({ userName: "ALICE", status: "submitted" });
    const b = entry({ userName: "BOB", status: "registered" });
    const c = entry({ userName: "CARA", status: "partial" });
    const plan = planFinalField([a, b, c], size);
    expect(plan).toHaveLength(size);
    // a is human, b/c are reservedBots, and one generic fills the 4th slot.
    expect(plan[0]).toMatchObject({ kind: "human" });
    const reserved = plan.filter((s) => s.kind === "reservedBot");
    expect(reserved).toHaveLength(2);
    expect(reserved.map((s) => (s.kind === "reservedBot" ? s.botName : "")).sort()).toEqual([
      "BOB BOT",
      "CARA BOT",
    ]);
    expect(plan.filter((s) => s.kind === "genericBot")).toHaveLength(1);
  });

  it("empty slots become generic bots, named BOT 1.. in order", () => {
    const size: PrivateSize = 8;
    const plan = planFinalField([entry(), entry()], size);
    expect(plan).toHaveLength(size);
    const generics = plan.filter((s) => s.kind === "genericBot");
    expect(generics).toHaveLength(6);
    expect(generics.map((s) => (s.kind === "genericBot" ? s.botName : ""))).toEqual([
      "BOT 1",
      "BOT 2",
      "BOT 3",
      "BOT 4",
      "BOT 5",
      "BOT 6",
    ]);
    // seedIndex is 0-based and contiguous.
    expect(generics.map((s) => (s.kind === "genericBot" ? s.seedIndex : -1))).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it("tolerates purge-emptied slots: one submitted human + generic-bot fill", () => {
    // After the 10-minute completion purge frees slots (public tournaments),
    // finalize can see FEWER entries than the field size. planFinalField must still
    // return exactly `size` slots, padding gaps with generic bots — so a public
    // tournament with kicked entrants still finalizes into a valid bracket.
    const size: PrivateSize = 4;
    const plan = planFinalField([entry({ status: "submitted" })], size);
    expect(plan).toHaveLength(size);
    expect(plan[0]).toMatchObject({ kind: "human" });
    expect(plan.filter((s) => s.kind === "genericBot")).toHaveLength(3);
  });

  it("ordering is submitted humans → reserved bots → generic bots, deterministic", () => {
    const size: PrivateSize = 8;
    const subA = entry({ userName: "A", status: "submitted" });
    const reg = entry({ userName: "R", status: "registered" });
    const subB = entry({ userName: "B", status: "submitted" });
    // Pass in mixed order; submitted must come first regardless of input order.
    const plan1 = planFinalField([reg, subA, subB], size);
    const plan2 = planFinalField([reg, subA, subB], size);
    expect(plan1).toEqual(plan2); // deterministic
    expect(plan1[0]).toMatchObject({ kind: "human" });
    expect(plan1[1]).toMatchObject({ kind: "human" });
    expect(plan1[2]).toMatchObject({ kind: "reservedBot", botName: "R BOT" });
    expect(plan1.slice(3).every((s) => s.kind === "genericBot")).toBe(true);
  });

  it("always returns exactly size slots and clamps excess entries", () => {
    const size: PrivateSize = 4;
    const many = Array.from({ length: 7 }, () => entry({ status: "submitted" }));
    const plan = planFinalField(many, size);
    expect(plan).toHaveLength(size);
    expect(plan.every((s) => s.kind === "human")).toBe(true);
  });
});

// ── name helpers ──────────────────────────────────────────────────────────────

describe("bot name helpers", () => {
  it("reservedBotName appends BOT", () => {
    expect(reservedBotName("ZED")).toBe("ZED BOT");
  });
  it("genericBotName is 1-based", () => {
    expect(genericBotName(0)).toBe("BOT 1");
    expect(genericBotName(4)).toBe("BOT 5");
  });
});

// ── startersMatchBoard ────────────────────────────────────────────────────────

function board(): PrivateBoard {
  return {
    slots: [
      { team: "AAA", decade: 1990 },
      { team: "BBB", decade: 2000 },
      { team: "CCC", decade: 2010 },
      { team: "DDD", decade: 1980 },
      { team: "EEE", decade: 2020 },
    ],
    benchSlot: { team: "FFF", decade: 1970 },
    mode: "blind",
  };
}

function pick(team: string, decade: number, slot: number): SimPick {
  return { entity_id: `${team}-${decade}`, team, decade, slot };
}

describe("startersMatchBoard", () => {
  it("matches the board's five starter slots as a SET (any position order)", () => {
    const b = board();
    // Same five (team, decade) pairs, assigned to arbitrary lineup slots.
    const picks = [
      pick("EEE", 2020, 0),
      pick("AAA", 1990, 1),
      pick("DDD", 1980, 2),
      pick("BBB", 2000, 3),
      pick("CCC", 2010, 4),
    ];
    expect(startersMatchBoard(picks, b)).toBe(true);
  });

  it("rejects a pick not on the board", () => {
    const b = board();
    const picks = [
      pick("EEE", 2020, 0),
      pick("AAA", 1990, 1),
      pick("DDD", 1980, 2),
      pick("BBB", 2000, 3),
      pick("ZZZ", 2010, 4), // off-board
    ];
    expect(startersMatchBoard(picks, b)).toBe(false);
  });

  it("rejects a duplicated board slot (wrong count of distinct keys)", () => {
    const b = board();
    const picks = [
      pick("AAA", 1990, 0),
      pick("AAA", 1990, 1), // dup of slot 0's combo
      pick("DDD", 1980, 2),
      pick("BBB", 2000, 3),
      pick("CCC", 2010, 4),
    ];
    expect(startersMatchBoard(picks, b)).toBe(false);
  });
});

// ── statusLabel ───────────────────────────────────────────────────────────────

// Build a minimal synthetic BracketResult with arbitrary rounds. Each round is a
// list of series; statusLabel/deriveYou only read hiId/loId/winnerId per series.
function series(hiId: string, loId: string, winnerId: string): SeriesResult {
  return { hiId, loId, bestOf: 7, games: [], winnerId, scoreHi: 4, scoreLo: 0 };
}
function bt(id: string, over: Partial<BracketTeam> = {}): BracketTeam {
  return {
    id,
    name: id,
    isGhost: false,
    conference: "East",
    seed: 1,
    seedNet: 0,
    ...over,
  };
}

describe("statusLabel", () => {
  it("Champion when the team wins every round including the Final", () => {
    // 2-round bracket (size 4): conf final (round idx 0) + Final (round idx 1).
    const bracket: BracketResult = {
      teams: [bt("ME"), bt("X"), bt("Y")],
      rounds: [
        [series("ME", "X", "ME")], // conf final: ME wins
        [series("ME", "Y", "ME")], // Final: ME wins
      ],
      championId: "ME",
      championName: "ME",
      size: 4,
    };
    expect(statusLabel(bracket, "ME")).toBe("Champion");
  });

  it("Lost Finals when the team reaches the Final and loses it", () => {
    const bracket: BracketResult = {
      teams: [bt("ME"), bt("X"), bt("Y")],
      rounds: [
        [series("ME", "X", "ME")], // conf final: ME wins
        [series("ME", "Y", "Y")], // Final: ME loses
      ],
      championId: "Y",
      championName: "Y",
      size: 4,
    };
    expect(statusLabel(bracket, "ME")).toBe("Lost Finals");
  });

  it("Lost Conf Finals when it loses the round before the Final", () => {
    // 3-round bracket (size 8): semis(0), conf final(1), Final(2).
    const bracket: BracketResult = {
      teams: [bt("ME"), bt("X"), bt("Y"), bt("Z")],
      rounds: [
        [series("ME", "X", "ME")], // semis: ME wins
        [series("ME", "Y", "Y")], // conf final: ME loses
        [series("Y", "Z", "Y")], // Final
      ],
      championId: "Y",
      championName: "Y",
      size: 8,
    };
    expect(statusLabel(bracket, "ME")).toBe("Lost Conf Finals");
  });

  it("Lost R1 when it loses its first series in a deep bracket", () => {
    const bracket: BracketResult = {
      teams: [bt("ME"), bt("X")],
      rounds: [
        [series("ME", "X", "X")], // R1: ME loses immediately
        [series("X", "X", "X")],
        [series("X", "X", "X")],
        [series("X", "X", "X")], // 4-round (size 16-ish) tree
      ],
      championId: "X",
      championName: "X",
      size: 16,
    };
    expect(statusLabel(bracket, "ME")).toBe("Lost R1");
  });

  it("Lost Play-In reads the BracketTeam flag (size 20)", () => {
    const bracket: BracketResult = {
      teams: [bt("ME", { lostPlayIn: true }), bt("X")],
      rounds: [[series("X", "X", "X")]],
      championId: "X",
      championName: "X",
      size: 20,
    };
    expect(statusLabel(bracket, "ME")).toBe("Lost Play-In");
  });

  it("Eliminated fallback when the team isn't in the bracket", () => {
    const bracket: BracketResult = {
      teams: [bt("X")],
      rounds: [[series("X", "X", "X")]],
      championId: "X",
      championName: "X",
      size: 4,
    };
    expect(statusLabel(bracket, "GHOST")).toBe("Eliminated");
  });
});
