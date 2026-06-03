import { describe, it, expect } from "vitest";
import {
  simulateRoster,
  netRatingForPerfect,
  SCORING_CONFIG as C,
  type ScoringPlayer,
} from "./scoring";

function p(over: Partial<ScoringPlayer>): ScoringPlayer {
  return {
    gq: 0.5, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
    fga: 0, fg3a: 0, fg3m: 0, fta: 0, tov: 0,
    ...over,
  };
}

// A balanced five (2 guards, a wing, 2 bigs) that meets every fit target.
function balancedRoster(gq: number): ScoringPlayer[] {
  return [
    p({ gq, ast: 9, stl: 1.5, fga: 12, fta: 3, tov: 2, fg3m: 2.5, reb: 3, blk: 0.2 }),
    p({ gq, ast: 5, stl: 1.2, fga: 13, fta: 3, tov: 1.5, fg3m: 2.5, reb: 4, blk: 0.4 }),
    p({ gq, ast: 3, stl: 1.0, fga: 13, fta: 4, tov: 1.5, fg3m: 2.0, reb: 6, blk: 0.6 }),
    p({ gq, ast: 2, stl: 0.8, fga: 12, fta: 4, tov: 1.5, fg3m: 1.5, reb: 8, blk: 1.0 }),
    p({ gq, ast: 1.5, stl: 0.6, fga: 11, fta: 5, tov: 1.5, fg3m: 0.5, reb: 11, blk: 1.8 }),
  ];
}

describe("simulateRoster", () => {
  it("a balanced league-average roster is 41-41", () => {
    const r = simulateRoster(balancedRoster(C.AVG_GQ));
    expect(r.balancePen).toBe(0);
    expect(r.synergyBonus).toBe(0);
    expect(r.netRating).toBe(0);
    expect(r.wins).toBe(41);
  });

  it("82-0 requires ≈ +15 net rating", () => {
    expect(netRatingForPerfect()).toBeCloseTo(15.2, 1);
  });

  it("a flawlessly built, balanced elite roster earns synergy and goes 82-0", () => {
    const r = simulateRoster(balancedRoster(0.83));
    expect(r.synergyBonus).toBeGreaterThan(0);
    expect(r.perfect).toBe(true);
  });

  it("no true guard is penalized hard and earns no synergy", () => {
    // Five frontcourt players (high reb/blk, low ast) → 0 natural guards.
    const bigs = Array.from({ length: 5 }, () =>
      p({ gq: 0.8, ast: 2, stl: 0.8, reb: 10, blk: 1.5, fga: 13, fta: 5, tov: 2, fg3m: 1 }),
    );
    const r = simulateRoster(bigs);
    expect(r.roleCounts.G).toBe(0);
    expect(r.balancePen).toBeGreaterThanOrEqual(C.NO_GUARD_PEN);
    expect(r.synergyBonus).toBe(0);
    // Much worse than the same talent, balanced.
    expect(r.wins).toBeLessThan(simulateRoster(balancedRoster(0.8)).wins);
  });

  it("a lineup with no steals or blocks takes the defense penalty", () => {
    const noD = balancedRoster(0.75).map((x) => ({ ...x, stl: 0, blk: 0 }));
    const r = simulateRoster(noD);
    expect(r.defenseFactor).toBe(0);
    expect(r.defensePen).toBe(C.DEFENSE_MAX_PEN);
  });

  it("five ball-dominant chuckers trigger the usage penalty", () => {
    const hogs = balancedRoster(0.75).map((x) => ({ ...x, fga: 26, fta: 9, tov: 4 }));
    const r = simulateRoster(hogs);
    expect(r.usageFactor).toBeLessThan(0.85);
    expect(r.usagePen).toBeGreaterThan(2);
  });

  it("better players (higher GQ) win more, all else equal", () => {
    const lo = simulateRoster(balancedRoster(0.6));
    const hi = simulateRoster(balancedRoster(0.8));
    expect(hi.wins).toBeGreaterThan(lo.wins);
  });
});
