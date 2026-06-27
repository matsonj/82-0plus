import { describe, it, expect } from "vitest";
import {
  simulateRoster,
  netRatingForPerfect,
  SCORING_CONFIG as C,
  type ScoringPlayer,
} from "./scoring";

function p(over: Partial<ScoringPlayer>): ScoringPlayer {
  return {
    // season 2010's league pace == REF_PACE, so paceAdj == 1.0 (usage unaffected).
    gq: 0.5, season: 2010, mpg: 36, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
    fga: 0, fg3a: 0, fg3m: 0, fta: 0, tov: 0, fgm: 0, ftm: 0, tsplus: 1.0,
    height_in: 79, pos: null, allDef: 0,
    ...over,
  };
}

// A balanced five (2 guards, a wing, 2 bigs) that spaces the floor, shares the
// ball (assisted-FG% well above target) and fits the possession budget.
function balancedRoster(gq: number): ScoringPlayer[] {
  return [
    p({ gq, ast: 8, stl: 1.5, fga: 12, fgm: 6, fta: 3, ftm: 2, tov: 2, fg3a: 6, fg3m: 2.5, reb: 3, blk: 0.2 }),
    p({ gq, ast: 5, stl: 1.2, fga: 13, fgm: 6, fta: 3, ftm: 2, tov: 1.5, fg3a: 6, fg3m: 2.5, reb: 4, blk: 0.4 }),
    p({ gq, ast: 4, stl: 1.0, fga: 12, fgm: 6, fta: 4, ftm: 3, tov: 1.5, fg3a: 5, fg3m: 2.0, reb: 6, blk: 0.6 }),
    p({ gq, ast: 3, stl: 0.8, fga: 12, fgm: 6, fta: 4, ftm: 3, tov: 1.5, fg3a: 4, fg3m: 1.5, reb: 8, blk: 1.0 }),
    p({ gq, ast: 2, stl: 0.6, fga: 11, fgm: 5, fta: 5, ftm: 4, tov: 1.5, fg3a: 3, fg3m: 1.0, reb: 11, blk: 1.8 }),
  ];
}

describe("simulateRoster", () => {
  it("a balanced, well-built, average-talent roster is 41-41", () => {
    const r = simulateRoster(balancedRoster(C.AVG_GQ));
    expect(r.balancePen).toBe(0);
    expect(r.usagePen).toBe(0);
    expect(r.outsidePen).toBe(0);
    expect(r.ballhogPen).toBe(0);
    expect(r.sizePen).toBe(0); // 5 × 79" = 395 ≥ target
    expect(r.defBuff).toBe(0);
    expect(r.synergyBonus).toBe(0);
    expect(r.netRating).toBe(0);
    expect(r.wins).toBe(41);
  });

  it("a too-short lineup is penalized; All-Defense adds effective height + a margin buff", () => {
    const short = balancedRoster(0.75).map((x) => ({ ...x, height_in: 75 }));
    const r = simulateRoster(short);
    expect(r.sizePen).toBeGreaterThan(0); // 5 × 75 = 375, in the penalty ramp
    // Make two of them All-Defense 1st team: effective height up, margin buff up.
    const stoppers = short.map((x, i) => (i < 2 ? { ...x, allDef: 1 } : x));
    const rs = simulateRoster(stoppers);
    expect(rs.defBuff).toBe(2 * C.DEF_MARGIN_1ST);
    expect(rs.sizePen).toBeLessThan(r.sizePen); // effective inches reduce the size hit
    expect(rs.wins).toBeGreaterThan(r.wins);
  });

  it("All-Defense margin buff is capped", () => {
    const allStoppers = balancedRoster(0.7).map((x) => ({ ...x, allDef: 1 }));
    const r = simulateRoster(allStoppers);
    expect(r.defBuff).toBe(C.DEF_MARGIN_CAP); // 5×2=10 capped to 7
  });

  it("82-0 requires ≈ +15 net rating", () => {
    expect(netRatingForPerfect()).toBeCloseTo(15.2, 1);
  });

  it("keeps unrounded seedNet for tier math when display net rounds up", () => {
    const edgeNet = (81.49 - C.BASE_WINS) / C.WINS_PER_NET;
    const edgeGq =
      C.AVG_GQ + edgeNet / (C.NET_PER_GQ * (1 + C.SYNERGY_FRAC));
    const r = simulateRoster(balancedRoster(edgeGq));

    expect(r.wins).toBe(81);
    expect(r.netRating).toBe(15);
    expect(r.seedNet).toBeLessThan(15);
  });

  it("an elite, spaced, ball-moving, balanced roster earns synergy and goes 82-0", () => {
    const r = simulateRoster(balancedRoster(0.92));
    expect(r.synergyBonus).toBeGreaterThan(0);
    expect(r.perfect).toBe(true);
  });

  it("ball-hog tax: an iso lineup (few assisted FGs) wins less than the same passing lineup", () => {
    const passing = simulateRoster(balancedRoster(0.78));
    const iso = simulateRoster(balancedRoster(0.78).map((x) => ({ ...x, ast: 0.5 })));
    expect(passing.ballhogPen).toBe(0);
    expect(iso.ballhogPen).toBeGreaterThan(0);
    expect(iso.wins).toBeLessThan(passing.wins);
  });

  it("outside shooting: 0–1 non-shooters free, 2 hurts, 3+ is brutal", () => {
    // balancedRoster shooters all have FT% ~0.67–0.93 and decent 3P% → 0 liabilities.
    const base = balancedRoster(0.78);
    const clean = simulateRoster(base);
    expect(clean.nonShooters).toBe(0);
    expect(clean.outsidePen).toBe(0);
    // Turn players into bad-FT, no-3 bigs (Shaq/Ben-Wallace types).
    const brick = (x: ScoringPlayer): ScoringPlayer => ({ ...x, fta: 8, ftm: 4, fg3a: 0, fg3m: 0 });
    const stamp = (k: number) => simulateRoster(base.map((x, i) => (i < k ? brick(x) : x)));
    expect(stamp(1).outsidePen).toBe(0); // one is free
    expect(stamp(2).outsidePen).toBe(C.OUTSIDE_PEN_2);
    expect(stamp(3).outsidePen).toBe(C.OUTSIDE_PEN_3PLUS);
    expect(stamp(4).outsidePen).toBe(C.OUTSIDE_PEN_3PLUS); // capped at 3+
    expect(stamp(3).wins).toBeLessThan(clean.wins);
  });

  it("a proven FT shooter with a cold low-volume 3P% is NOT a non-shooter", () => {
    // The Wilkins/Majerle case: real FT touch (≥ FG3_SHOOTER_FT_FLOOR) but a poor
    // 3P% on few attempts. Under the legacy FT-touch model, that touch spaced the
    // floor; the live era-aware model now requires enough made-volume in the 3pt era.
    const shooter = p({ gq: 0.7, fta: 6, ftm: 5, fg3a: 3, fg3m: 0.7, fga: 16, fgm: 8, ast: 3, reb: 6 }); // FT .833, 3P .233
    const five = Array.from({ length: 5 }, () => shooter);
    expect(simulateRoster(five, { ...C, SPACING_REQUIRE_VOLUME: false }).nonShooters).toBe(0);
    expect(simulateRoster(five).nonShooters).toBe(5);
    // …but a poor 3pt shooter who ALSO lacks FT touch is still a non-shooter.
    const brickBadFt = p({ gq: 0.7, fta: 6, ftm: 3.5, fg3a: 3, fg3m: 0.7, fga: 16, fgm: 8 }); // FT .583
    expect(simulateRoster(Array.from({ length: 5 }, () => brickBadFt)).nonShooters).toBe(5);
  });

  it("a pre-line great FT shooter who never shoots threes is NOT a non-shooter (era-fair)", () => {
    // 0 three-point attempts (e.g. pre-1980), strong FT% → not flagged.
    const oldStars = Array.from({ length: 5 }, () =>
      p({ gq: 0.7, season: 1976, ast: 4, reb: 6, blk: 0.5, fga: 14, fgm: 7, fta: 6, ftm: 5, fg3a: 0, fg3m: 0, tov: 2 }),
    );
    expect(simulateRoster(oldStars).nonShooters).toBe(0);
  });

  it("era-aware spacing requires 3pt-era volume while preserving old-era FT touch", () => {
    const legacy = { ...C, SPACING_REQUIRE_VOLUME: false };
    const modernFtTouchNoVolume = p({
      gq: 0.7,
      season: 1990,
      fta: 10,
      ftm: 8,
      fg3a: 0,
      fg3m: 0,
      fga: 14,
      fgm: 7,
    });
    const preLineFtTouch = { ...modernFtTouchNoVolume, season: 1976 };
    const modernEliteFt = { ...modernFtTouchNoVolume, ftm: 9 };
    const modernVolumeShooter = {
      ...modernFtTouchNoVolume,
      fg3a: 2,
      fg3m: 0.7,
    };

    expect(simulateRoster([modernFtTouchNoVolume], legacy).nonShooters).toBe(0);
    expect(simulateRoster([modernFtTouchNoVolume]).nonShooters).toBe(1);
    expect(simulateRoster([preLineFtTouch]).nonShooters).toBe(0);
    expect(simulateRoster([modernEliteFt]).nonShooters).toBe(0);
    expect(simulateRoster([modernVolumeShooter]).nonShooters).toBe(0);
  });

  it("no true guard is penalized hard and earns no synergy", () => {
    // Five frontcourt players (high reb/blk, low ast) → 0 natural guards.
    const bigs = Array.from({ length: 5 }, () =>
      p({ gq: 0.8, ast: 2, stl: 0.8, reb: 10, blk: 1.5, fga: 13, fgm: 7, fta: 5, ftm: 3, tov: 2, fg3m: 2 }),
    );
    const r = simulateRoster(bigs);
    expect(r.roleCounts.G).toBe(0);
    expect(r.balancePen).toBeGreaterThanOrEqual(C.NO_GUARD_PEN);
    expect(r.synergyBonus).toBe(0);
    // Much worse than the same talent, balanced.
    expect(r.wins).toBeLessThan(simulateRoster(balancedRoster(0.8)).wins);
  });

  it("five ball-dominant chuckers max out the usage penalty", () => {
    // poss ≈ 26 + 0.44·9 + 4 = 33.96/slot → ~170 total, ~70% over the 100 budget —
    // well past USAGE_FULL_OVERAGE, so the convex penalty saturates at the cap.
    const hogs = balancedRoster(0.75).map((x) => ({ ...x, fga: 26, fta: 9, tov: 4 }));
    const r = simulateRoster(hogs);
    expect(r.usageFactor).toBeLessThan(0.85);
    expect(r.usagePen).toBe(C.USAGE_MAX_PEN);
  });

  it("usage penalty is convex: each step over budget costs progressively more", () => {
    // Five identical players dialed to a target total-possession load. At/under the
    // 100-possession budget there's no penalty; above it the cost grows faster than
    // linearly, so the jump from 120→135 dwarfs the jump from 105→120.
    const atLoad = (totalPoss: number) =>
      simulateRoster(
        Array.from({ length: 5 }, () => p({ gq: 0.8, fga: totalPoss / 5, tov: 0 })),
      ).usagePen;
    const onBudget = atLoad(100);
    const slightlyOver = atLoad(120);
    const wayOver = atLoad(135);
    expect(onBudget).toBe(0); // at budget → free
    expect(slightlyOver).toBeGreaterThan(0);
    expect(wayOver).toBeGreaterThan(slightlyOver);
    // Convexity: the second 15-possession step hurts more than the first.
    expect(wayOver - slightlyOver).toBeGreaterThan(slightlyOver - onBudget);
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
      fg3m: 0, // no threes in this fixture
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

  it("talent-scaled floor: an elite-talent but badly-built roster lands in B/A, not 0", () => {
    // High talent (baseNet ≫ 60-win mark) but maximally penalized: ball-dominant
    // chuckers, all bad shooters, no guard. Without the floor this craters to ~0.
    const wrecking = balancedRoster(0.85).map((x) => ({
      ...x,
      ast: 0.3, fga: 28, fta: 9, tov: 4, ftm: 3, fg3a: 0, fg3m: 0, reb: 11, blk: 1.5,
    }));
    const r = simulateRoster(wrecking);
    expect(r.baseNet).toBeGreaterThan(C.NET_PER_GQ * 0); // sanity: positive talent
    // Raw (un-floored) net would be deeply negative; the floor rescues it.
    expect(r.usagePen + r.outsidePen + r.ballhogPen + r.balancePen).toBeGreaterThan(20);
    expect(r.wins).toBeGreaterThanOrEqual(60); // floored into B/A, not ruined
    expect(r.perfect).toBe(false); // …but still can't be S/AA
    expect(r.wins).toBeLessThanOrEqual(79); // floor clamped below AA
  });

  it("floor doesn't bind a clean elite roster (still reaches 82-0) nor rescue weak teams", () => {
    // Clean elite: floor is below rawNet, so unchanged — still perfect.
    expect(simulateRoster(balancedRoster(0.92)).perfect).toBe(true);
    // Weak talent (baseNet ≤ 60-win net): penalties bite fully, no floor rescue.
    const weakIso = balancedRoster(0.55).map((x) => ({ ...x, ast: 0.3 }));
    const weakPassing = simulateRoster(balancedRoster(0.55));
    expect(simulateRoster(weakIso).wins).toBeLessThan(weakPassing.wins);
  });

  it("absolute cap: construction can't subtract more than MAX_FIT_PENALTY, even sub-elite", () => {
    // Sub-elite talent (baseNet below the 60-win net, so the TALENT floor does not
    // apply), maximally penalized: chuckers, no shooters, no guard. The absolute
    // Team-fit cap still bounds the damage at MAX_FIT_PENALTY.
    const net60 = (60 - C.BASE_WINS) / C.WINS_PER_NET;
    const wrecked = balancedRoster(0.55).map((x) => ({
      ...x, ast: 0.3, fga: 28, fta: 9, ftm: 4, tov: 4, fg3a: 0, fg3m: 0, reb: 11, blk: 1.5,
    }));
    const r = simulateRoster(wrecked);
    expect(r.baseNet).toBeGreaterThan(0); // real (sub-elite) talent…
    expect(r.baseNet).toBeLessThan(net60); // …below the elite-floor threshold
    expect(r.usagePen + r.outsidePen + r.ballhogPen + r.balancePen).toBeGreaterThan(C.MAX_FIT_PENALTY);
    expect(r.teamFit).toBeCloseTo(-C.MAX_FIT_PENALTY, 1); // capped, not −40+
  });

  it("teamFit collapses the construction factors (= net − talent − defense)", () => {
    const r = simulateRoster(balancedRoster(0.78));
    expect(r.teamFit).toBeCloseTo(
      Math.round((r.netRating - r.baseNet - r.defBuff) * 10) / 10,
      1,
    );
  });

  it("better players (higher GQ) win more, all else equal", () => {
    const lo = simulateRoster(balancedRoster(0.6));
    const hi = simulateRoster(balancedRoster(0.8));
    expect(hi.wins).toBeGreaterThan(lo.wins);
  });
});
