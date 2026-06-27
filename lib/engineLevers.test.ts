import { describe, it, expect } from "vitest";
import { simulateRoster, SCORING_CONFIG as C, type ScoringPlayer } from "./scoring";
import { paceAdj } from "./pace";
import {
  TOURNAMENT_CONFIG as TC,
  per36Totals,
  gameScoreSpec,
  gameScoreCompare,
  type TournamentTeam,
  type GsKey,
} from "./tournament";

// ── shared factories (mirror scoring.test.ts / tournament.test.ts) ──────────────
function p(over: Partial<ScoringPlayer> = {}): ScoringPlayer {
  return {
    gq: 0.5, season: 2010, mpg: 36, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
    fga: 0, fg3a: 0, fg3m: 0, fta: 0, tov: 0, fgm: 0, ftm: 0, tsplus: 1.0,
    height_in: 79, pos: null, allDef: 0,
    ...over,
  };
}
function team(starters: ScoringPlayer[], over: Partial<TournamentTeam> = {}): TournamentTeam {
  return {
    id: "t", name: "t", isGhost: false,
    starters, sixthMan: over.sixthMan ?? p(),
    captainSlot: 0, ageAtPeak: TC.LEAGUE_AVG_EXP, sixthManAge: TC.LEAGUE_AVG_EXP,
    seedNet: 0, ...over,
  };
}

// ── Live defaults reflect the adopted height-aware retune ────────────────────────
describe("height-aware retune is live in the defaults", () => {
  it("seed + bracket knobs are at their adopted values", () => {
    expect(C.OVERSIZE_MAX_PEN).toBe(6);
    expect(TC.PACE_ADJUST_GAMESCORE).toBe(true);
    expect(TC.GAMESCORE_CATEGORIES).toBe("rebalanced");
    expect(TC.HEIGHT_PER_INCH).toBe(0.045);
    expect(TC.HEIGHT_CAP).toBe(0.9);
  });
});

// ── Seed: excess-frontcourt-height penalty (oversizePen) ────────────────────────
describe("oversize-height penalty (seed)", () => {
  // A well-CONSTRUCTED but very tall five (sum 420): spaces, shares the ball, no
  // role skew — so its seed sits above the talent floor and the oversize tax bites.
  const tallBuilt: ScoringPlayer[] = [
    p({ gq: 0.8, height_in: 84, ast: 8, stl: 1.5, fga: 12, fgm: 6, fta: 3, ftm: 2.5, tov: 2, fg3m: 2.5, reb: 3, blk: 0.2 }),
    p({ gq: 0.8, height_in: 84, ast: 5, stl: 1.2, fga: 13, fgm: 6, fta: 3, ftm: 2.5, tov: 1.5, fg3m: 2.5, reb: 4, blk: 0.4 }),
    p({ gq: 0.8, height_in: 84, ast: 4, stl: 1.0, fga: 12, fgm: 6, fta: 4, ftm: 3, tov: 1.5, fg3m: 2.0, reb: 6, blk: 0.6 }),
    p({ gq: 0.8, height_in: 84, ast: 3, stl: 0.8, fga: 12, fgm: 6, fta: 4, ftm: 3, tov: 1.5, fg3m: 1.5, reb: 8, blk: 1.0 }),
    p({ gq: 0.8, height_in: 84, ast: 2, stl: 0.6, fga: 11, fgm: 5, fta: 5, ftm: 4, tov: 1.5, fg3m: 1.0, reb: 11, blk: 1.8 }),
  ];
  const OFF = { ...C, OVERSIZE_MAX_PEN: 0 };
  const ON = { ...C, OVERSIZE_MAX_PEN: 6 };

  it("taxes a far-too-tall five and lowers its seed when enabled", () => {
    const off = simulateRoster(tallBuilt, OFF);
    const on = simulateRoster(tallBuilt, ON);
    expect(off.oversizePen).toBe(0);
    expect(on.oversizePen).toBeGreaterThan(0); // 420 ≥ OVERSIZE_CAP_TOTAL → full pen
    expect(on.seedNet).toBeLessThan(off.seedNet);
  });

  it("never triggers on a short lineup (height below the floor)", () => {
    const short = tallBuilt.map((x) => ({ ...x, height_in: 78 })); // sum 390
    expect(simulateRoster(short, ON).oversizePen).toBe(0);
  });
});

// ── Bracket: pace-adjusted game-score totals ────────────────────────────────────
describe("pace-adjust game-score (bracket)", () => {
  const highPace = team(Array.from({ length: 5 }, () => p({ season: 1962, pts: 30 })));
  const ON = { ...TC, PACE_ADJUST_GAMESCORE: true };
  const OFF = { ...TC, PACE_ADJUST_GAMESCORE: false };

  it("scales a high-pace team's totals down vs. pace-off", () => {
    const off = per36Totals(highPace, undefined, OFF);
    const on = per36Totals(highPace, undefined, ON);
    expect(on.pts).toBeLessThan(off.pts); // 1962 pace ≫ ref → scaled down
    expect(on.pts).toBeCloseTo(off.pts * paceAdj(1962), 4); // all 5 starters share the era
  });

  it("leaves a modern (≈ref-pace) team unchanged", () => {
    const modern = team(Array.from({ length: 5 }, () => p({ season: 2010, pts: 30 })));
    expect(per36Totals(modern, undefined, ON).pts).toBeCloseTo(
      per36Totals(modern, undefined, OFF).pts,
      5,
    );
  });
});

// ── Bracket: rebalanced game-score category set ─────────────────────────────────
describe("rebalanced game-score categories (bracket)", () => {
  const LEGACY = { ...TC, GAMESCORE_CATEGORIES: "legacy" as const };
  const REBAL = { ...TC, GAMESCORE_CATEGORIES: "rebalanced" as const };

  it("legacy is 8 categories at weight 1; rebalanced folds size + adds fg3V (total 8)", () => {
    const legacy = gameScoreSpec(LEGACY);
    expect(legacy.total).toBe(8);
    expect(legacy.cats.every((c) => c.weight === 1)).toBe(true);
    const reb = gameScoreSpec(REBAL);
    expect(reb.total).toBe(8);
    expect(reb.cats.find((c) => c.key === "fg3V")).toBeTruthy();
    expect(reb.cats.find((c) => c.key === "reb")?.weight).toBe(0.5);
    expect(reb.cats.find((c) => c.key === "blk")?.weight).toBe(0.5);
  });

  it("size can no longer sweep: reb+blk count as 1, and 3pt is a real category", () => {
    const z = (over: Partial<Record<GsKey, number>>): Record<GsKey, number> => ({
      pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgV: 0, ftV: 0, tov: 0, fg3V: 0, ...over,
    });
    const big = z({ reb: 10, blk: 5 });   // wins rebounds + blocks
    const wing = z({ fg3V: 5, ast: 5 });  // wins threes + assists
    const legacy = gameScoreSpec(LEGACY).cats;
    const reb = gameScoreSpec(REBAL).cats;
    // Legacy: big wins reb+blk = 2, wing wins only ast = 1 (fg3V isn't a category).
    expect(gameScoreCompare(big, wing, legacy)).toEqual({ aWins: 2, bWins: 1 });
    // Rebalanced: big's reb+blk = 1.0; wing's ast + fg3V = 2.0 → wing now leads.
    const r = gameScoreCompare(big, wing, reb);
    expect(r.aWins).toBe(1);
    expect(r.bWins).toBe(2);
  });
});
