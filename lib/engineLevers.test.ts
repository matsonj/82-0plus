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
    expect(C.NET_PER_GQ).toBe(42.5);
    expect(C.OVERSIZE_PER_TALL).toBe(1);
    expect(C.OVERSIZE_FREE).toBe(2);
    expect(C.OVERSIZE_TALL_IN).toBe(83);
    expect(C.OVERSIZE_MAX_PEN).toBe(3);
    expect(C.SPACING_REQUIRE_VOLUME).toBe(true);
    expect(C.OUTSIDE_PEN_2).toBe(2);
    expect(C.OUTSIDE_PEN_3PLUS).toBe(4);
    expect(C.SPACING_ERA_SEASON).toBe(1979);
    expect(TC.PACE_ADJUST_GAMESCORE).toBe(true);
    expect(TC.GAMESCORE_CATEGORIES).toBe("rebalanced");
    expect(TC.HEIGHT_PER_INCH).toBe(0.045);
    expect(TC.HEIGHT_CAP).toBe(0.9);
  });
});

// ── Seed: excess-frontcourt penalty (count-based oversizePen) ────────────────────
describe("oversize penalty (seed) — count-based", () => {
  // Vary only height; oversizePen is computed from the COUNT of ≥83" starters and
  // returned regardless of the other penalties / the floor.
  const mk = (heights: number[]) => heights.map((h) => p({ gq: 0.8, height_in: h }));

  it("counts ≥83\" starters beyond the free allowance (twin-tower is free)", () => {
    expect(simulateRoster(mk([84, 84, 74, 74, 74])).oversizePen).toBe(0); // 2 tall → free
    expect(simulateRoster(mk([84, 84, 84, 74, 74])).oversizePen).toBe(1); // 3 tall → 1×1
    expect(simulateRoster(mk([84, 84, 84, 84, 74])).oversizePen).toBe(2); // 4 tall → 2×1
    expect(simulateRoster(mk([84, 84, 84, 84, 84])).oversizePen).toBe(3); // 5 tall → 3×1, capped at 3
    expect(simulateRoster(mk([78, 78, 78, 78, 78])).oversizePen).toBe(0); // no tall starters
  });

  it("catches the barbell a summed-height threshold misses (3 bigs + 2 short guards)", () => {
    // Well-built (spaces, shares, balanced) so the seed sits above the talent floor
    // and the tax is visible — 3 bigs + 2 short guards, summed height 400 (≈ field avg).
    const guard = (h: number) =>
      p({ gq: 0.8, height_in: h, ast: 7, stl: 1.5, fga: 12, fgm: 6, fta: 3, ftm: 2.5, tov: 1.8, fg3a: 5, fg3m: 2.2, reb: 3, blk: 0.3 });
    const big = (h: number) =>
      p({ gq: 0.8, height_in: h, ast: 3, stl: 0.8, fga: 11, fgm: 6, fta: 4, ftm: 3, tov: 1.5, fg3a: 3, fg3m: 1, reb: 9, blk: 1.4 });
    const barbell = [guard(74), guard(74), big(84), big(84), big(84)];
    expect(barbell.reduce((s, x) => s + x.height_in, 0)).toBe(400);
    const on = simulateRoster(barbell); // live default
    const off = simulateRoster(barbell, { ...C, OVERSIZE_MAX_PEN: 0 });
    expect(on.oversizePen).toBe(1); // taxed despite an average SUM (old sum-floor missed it)
    expect(on.seedNet).toBeLessThan(off.seedNet);
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
