import { describe, it, expect } from "vitest";
import {
  simulateRoster,
  netRatingForPerfect,
  SCORING_CONFIG as C,
  type ScoringPlayer,
} from "./scoring";

function p(over: Partial<ScoringPlayer>): ScoringPlayer {
  return {
    gq: 0.5, mpg: 36, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
    fga: 0, fg3a: 0, fg3m: 0, fta: 0, tov: 0, fgm: 0, ftm: 0, tsplus: 1.0,
    ...over,
  };
}

// A balanced five (2 guards, a wing, 2 bigs) that fits a fixed possession budget.
// `tsplus` sets every player's era-relative efficiency (1.0 = league average).
function balancedRoster(gq: number, tsplus = 1.0): ScoringPlayer[] {
  return [
    p({ gq, tsplus, ast: 9, stl: 1.5, fga: 12, fta: 3, tov: 2, fg3m: 2.5, reb: 3, blk: 0.2 }),
    p({ gq, tsplus, ast: 5, stl: 1.2, fga: 13, fta: 3, tov: 1.5, fg3m: 2.5, reb: 4, blk: 0.4 }),
    p({ gq, tsplus, ast: 3, stl: 1.0, fga: 13, fta: 4, tov: 1.5, fg3m: 2.0, reb: 6, blk: 0.6 }),
    p({ gq, tsplus, ast: 2, stl: 0.8, fga: 12, fta: 4, tov: 1.5, fg3m: 1.5, reb: 8, blk: 1.0 }),
    p({ gq, tsplus, ast: 1.5, stl: 0.6, fga: 11, fta: 5, tov: 1.5, fg3m: 0.5, reb: 11, blk: 1.8 }),
  ];
}

describe("simulateRoster", () => {
  it("a balanced, league-average-efficiency, average-talent roster is 41-41", () => {
    const r = simulateRoster(balancedRoster(C.AVG_GQ, C.EFF_PAR));
    expect(r.balancePen).toBe(0);
    expect(r.effPen).toBe(0); // par efficiency is not penalized
    expect(r.synergyBonus).toBe(0);
    expect(r.netRating).toBe(0);
    expect(r.wins).toBe(41);
  });

  it("82-0 requires ≈ +15 net rating", () => {
    expect(netRatingForPerfect()).toBeCloseTo(15.2, 1);
  });

  it("an elite, efficient, balanced, non-overlapping roster earns synergy and goes 82-0", () => {
    const r = simulateRoster(balancedRoster(0.85, 1.15));
    expect(r.synergyBonus).toBeGreaterThan(0);
    expect(r.perfect).toBe(true);
  });

  it("efficiency is required for 82-0: the same elite roster at par efficiency falls short", () => {
    const elite = simulateRoster(balancedRoster(0.85, 1.15));
    const par = simulateRoster(balancedRoster(0.85, C.EFF_PAR));
    expect(par.synergyBonus).toBe(0); // no elite-efficiency → no synergy
    expect(par.perfect).toBe(false);
    expect(par.wins).toBeLessThan(elite.wins);
  });

  it("below-average efficiency (volume chuckers) takes the efficiency penalty", () => {
    const inefficient = simulateRoster(balancedRoster(0.75, 0.85));
    const par = simulateRoster(balancedRoster(0.75, C.EFF_PAR));
    expect(inefficient.efficiencyFactor).toBe(0);
    expect(inefficient.effPen).toBe(C.EFF_MAX_PEN);
    expect(inefficient.wins).toBeLessThan(par.wins);
  });

  it("no true guard is penalized hard and earns no synergy", () => {
    // Five frontcourt players (high reb/blk, low ast) → 0 natural guards.
    const bigs = Array.from({ length: 5 }, () =>
      p({ gq: 0.8, tsplus: 1.15, ast: 2, stl: 0.8, reb: 10, blk: 1.5, fga: 13, fta: 5, tov: 2, fg3m: 1 }),
    );
    const r = simulateRoster(bigs);
    expect(r.roleCounts.G).toBe(0);
    expect(r.balancePen).toBeGreaterThanOrEqual(C.NO_GUARD_PEN);
    expect(r.synergyBonus).toBe(0);
    // Much worse than the same talent + efficiency, balanced.
    expect(r.wins).toBeLessThan(simulateRoster(balancedRoster(0.8, 1.15)).wins);
  });

  it("five ball-dominant chuckers trigger the usage penalty", () => {
    const hogs = balancedRoster(0.75).map((x) => ({ ...x, fga: 26, fta: 9, tov: 4 }));
    const r = simulateRoster(hogs);
    expect(r.usageFactor).toBeLessThan(0.85);
    expect(r.usagePen).toBeGreaterThan(2);
  });

  it("teamBox: integer totals + attempt-weighted FG%/FT% (mpg=42, on-budget ⇒ raw sums)", () => {
    // At 42 mpg the per-36+bench scale is 1; poss = 18 + 0.44·5 + 1.8 = 22/slot
    // ⇒ totalPoss = 110 = budget ⇒ usageScale 1, so totals equal raw sums.
    const five = Array.from({ length: 5 }, () =>
      p({ gq: 0.7, mpg: 42, pts: 20, reb: 6, ast: 4, stl: 1, blk: 0.5, tov: 1.8,
          fga: 18, fgm: 9, fta: 5, ftm: 4 }),
    );
    const r = simulateRoster(five);
    expect(r.usageFactor).toBe(1);
    expect(r.teamBox).toEqual({
      pts: 100, reb: 30, ast: 20, stl: 5, blk: 3, // whole integers (blk 2.5 → 3)
      fgPct: 50, // 45/90
      ftPct: 80, // 20/25
      tov: 9, // 1.8 × 5
    });
  });

  it("team box extrapolates per-36 with bench fill (stat × 42 / mpg)", () => {
    // 20 pts in 24 mpg → 20×42/24 = 35 per slot; ×5 = 175. poss 22/slot ⇒ on budget.
    const five = Array.from({ length: 5 }, () => p({ mpg: 24, pts: 20, fga: 20, tov: 2 }));
    const r = simulateRoster(five);
    expect(r.usageFactor).toBe(1);
    expect(r.teamBox.pts).toBe(175);
  });

  it("usage scales the box: over-budget discounts, under-budget bumps up", () => {
    const raw = 100; // 20 pts × 5 at mpg 42 (scale 1)
    const over = simulateRoster(
      Array.from({ length: 5 }, () => p({ mpg: 42, pts: 20, fga: 30, tov: 4 })),
    ); // poss 34/slot → 170 total → scale < 1
    const under = simulateRoster(
      Array.from({ length: 5 }, () => p({ mpg: 42, pts: 20, fga: 12, tov: 0 })),
    ); // poss 12/slot → 60 total → scale > 1
    expect(over.teamBox.pts).toBeLessThan(raw);
    expect(under.teamBox.pts).toBeGreaterThan(raw);
  });

  it("scoreline derives from the team box: pf = box pts, pa = pf − net", () => {
    const five = Array.from({ length: 5 }, () =>
      p({ gq: 0.8, mpg: 36, pts: 22, reb: 6, ast: 4, fga: 15, fgm: 8, fta: 5, ftm: 4 }),
    );
    const r = simulateRoster(five);
    expect(r.pf).toBe(r.teamBox.pts);
    expect(r.pa).toBe(Math.round(r.pf - r.netRating));
  });

  it("better players (higher GQ) win more, all else equal", () => {
    const lo = simulateRoster(balancedRoster(0.6));
    const hi = simulateRoster(balancedRoster(0.8));
    expect(hi.wins).toBeGreaterThan(lo.wins);
  });
});
