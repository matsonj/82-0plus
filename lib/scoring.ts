import type { SimResult } from "./types";
import { primaryRole, type Role } from "./positions";

/** A drafted player's box line plus their era-neutral Game Quality (peak-season median). */
export interface ScoringPlayer {
  gq: number;
  mpg: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fga: number;
  fg3a: number;
  fg3m: number;
  fta: number;
  tov: number;
  fgm: number;
  ftm: number;
  tsplus: number; // era-relative true-shooting (player TS% / league TS% that season)
}

/**
 * Roster → record model. Deliberately lean: talent dominates, and only the
 * construction factors that actually shape a five-star lineup modify it.
 *
 * Talent:  Game Quality (GQ) is the core — era-neutral by construction (each
 *   player-game is ranked only against contemporaries, and now only on the box
 *   categories the NBA actually tracked that era, so old-era greats aren't
 *   penalized for missing/fabricated stats). League-average ≈ .50.
 *
 * Construction factors that shape a five-star lineup (each shown on the result
 * as a net-rating adjustment off the GQ base, so the knobs are visible):
 *     • usage      — five ball-dominant stars can't all eat; possessions are a
 *                    fixed budget, so shot overlap throttles the lineup.
 *     • outside    — floor spacing by shooting QUALITY, not era-sensitive volume:
 *                    a "non-shooter" is FT% ≤ 65% (era-neutral touch tell) OR a
 *                    genuine bad 3pt shooter (shoots 3s and hits < 30%). One is
 *                    fine; each non-shooter beyond the first taxes the team —
 *                    you can't stack bad-shooting bigs and clog the paint.
 *     • ball-hog   — winning basketball moves the ball: if too few of the team's
 *                    made shots are assisted (assisted-FG% below target), a tax
 *                    hits iso-heavy stat accumulators.
 *     • balance    — by NATURAL position: no true guard (no real ball-handler /
 *                    perimeter D), no true big (no rim protection), or a lopsided
 *                    archetype (4+ of one).
 *     • synergy    — a small bonus when a roster spaces, shares, doesn't overload
 *                    usage AND is balanced: good construction is rewarded, not
 *                    just un-penalized. Gated so it can't manufacture net from a
 *                    flawed roster.
 *
 * GQ is deliberately weighted so talent doesn't swamp construction — a lineup of
 * high-GQ ball-dominant non-passers should NOT cruise to 82-0.
 *
 * Wins:  wins = 41 + 2.7 × netRating (nbastuffer projected win%). 82-0 ⇒ ≈ +15.2
 *   net — reachable only by an elite core that also spaces, shares, and fits.
 */
export const SCORING_CONFIG = {
  GAMES: 82,
  AVG_GQ: 0.5,
  NET_PER_GQ: 34, // GQ→net slope (≈ the real team-season slope; lower = talent matters less)
  WINS_PER_NET: 2.7,
  BASE_WINS: 41,

  // Fit penalties, in net-rating points subtracted at their worst.
  USAGE_MAX_PEN: 14, // shot-overlap of ball-dominant stars
  BALLHOG_MAX_PEN: 9, // iso-heavy, low assisted-FG%
  OUTSIDE_PEN_PER_EXTRA: 3, // per non-shooter beyond the first (clogs the paint)

  // Archetype-balance penalties (by natural position).
  NO_GUARD_PEN: 9, // no true ball-handler / perimeter defender
  NO_BIG_PEN: 7, // no true rim protection / rebounding
  SKEW_PEN: 3, // per player beyond 3 sharing one natural position

  // Construction synergy: a well-spaced, ball-moving, non-overloaded AND balanced
  // roster amplifies talent — the upside that lets a great team reach 82-0.
  SYNERGY_FRAC: 0.12, // up to +12% of base net rating

  // Fit targets.
  POSS_BUDGET_PER_SLOT: 22, // possessions (fga + 0.44·fta + tov) one slot can absorb
  USAGE_BOX_MIN: 0.6, // floor on the box usage-scale (heavy overload can't zero scoring)
  USAGE_BOX_MAX: 1.4, // cap on the box usage-scale (under-usage bump is bounded)
  ASSIST_RATE_TARGET: 0.55, // assisted-FG% at/above which the ball-hog tax is zero
  // Outside-shooting (spacing) thresholds.
  FT_LIABILITY_MAX: 0.65, // FT% at/below this → non-shooter (era-neutral touch tell)
  FG3_LIABILITY_MAX: 0.3, // 3P% below this → non-shooter (only if they shoot enough 3s)
  FG3_MIN_ATTEMPTS: 1.0, // 3PA/game needed before 3P% is judged (avoids era false-flags)
} as const;

export type ScoringConfig = typeof SCORING_CONFIG;

const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));
const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
// Whole-integer percentage from summed makes / summed attempts (attempt-weighted).
const pctOf = (made: number, att: number) =>
  att > 0 ? Math.round((100 * made) / att) : 0;

/** Net rating that, alone, would project to a perfect season. */
export function netRatingForPerfect(cfg: ScoringConfig = SCORING_CONFIG): number {
  return (cfg.GAMES - cfg.BASE_WINS) / cfg.WINS_PER_NET; // 41 / 2.7 ≈ 15.2
}

export function simulateRoster(
  roster: ScoringPlayer[],
  cfg: ScoringConfig = SCORING_CONFIG,
): SimResult {
  const n = roster.length;
  if (n === 0) {
    return {
      wins: 0, losses: cfg.GAMES, perfect: false, netRating: 0, baseNet: 0, meanGQ: 0,
      pf: 0, pa: 0,
      usageFactor: 1, assistFactor: 1, nonShooters: 0,
      totalAst: 0, assistedPct: 0,
      usagePen: 0, outsidePen: 0, ballhogPen: 0, balancePen: 0, synergyBonus: 0,
      roleCounts: { G: 0, W: 0, B: 0 },
      totalPoss: 0,
      teamBox: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgPct: 0, ftPct: 0, tov: 0 },
    };
  }

  const sum = (f: (p: ScoringPlayer) => number) =>
    roster.reduce((acc, p) => acc + f(p), 0);
  const poss = (p: ScoringPlayer) => p.fga + 0.44 * p.fta + p.tov;

  const meanGQ = sum((p) => p.gq) / n;
  const totalPoss = sum(poss);
  const totalAst = sum((p) => p.ast);
  const totalFgm = sum((p) => p.fgm);

  // Era-neutral team quality → base net rating (before construction adjustments).
  const baseNet = cfg.NET_PER_GQ * (meanGQ - cfg.AVG_GQ);

  // Fit factors in [0, 1] (1 = no problem).
  const usageRatio =
    totalPoss > 0 ? (n * cfg.POSS_BUDGET_PER_SLOT) / totalPoss : 1;
  // Penalty/synergy only care about OVER-budget overlap (capped at 1).
  const usageFactor = Math.min(1, usageRatio);
  // The box uses the uncapped ratio (clamped): >1 bumps an under-used lineup's
  // scoring up to fill the spare possessions, <1 discounts an overloaded one.
  const usageScale = clamp(usageRatio, cfg.USAGE_BOX_MIN, cfg.USAGE_BOX_MAX);

  // Outside shooting: count "non-shooters" by quality. FT% ≤ threshold is the
  // era-neutral touch tell; a bad 3P% only counts if the player actually shoots
  // 3s (so old-era players with 0 attempts aren't false-flagged). One non-shooter
  // is fine; each one beyond the first taxes the team (paint gets clogged).
  const isNonShooter = (p: ScoringPlayer) =>
    (p.fta >= 1 && p.ftm / p.fta <= cfg.FT_LIABILITY_MAX) ||
    (p.fg3a >= cfg.FG3_MIN_ATTEMPTS && p.fg3m / p.fg3a < cfg.FG3_LIABILITY_MAX);
  const nonShooters = roster.reduce((c, p) => c + (isNonShooter(p) ? 1 : 0), 0);
  const extraNonShooters = Math.max(0, nonShooters - 1);
  const outsidePen = cfg.OUTSIDE_PEN_PER_EXTRA * extraNonShooters;
  const shootFactor = clamp(1 - extraNonShooters / Math.max(1, n - 1), 0, 1);

  // Ball movement: share of made FGs that were assisted. Below target → ball-hog
  // tax on iso-heavy stat accumulators who don't play winning basketball.
  const assistedPct = totalFgm > 0 ? Math.min(1, totalAst / totalFgm) : 0;
  const assistFactor = clamp(assistedPct / cfg.ASSIST_RATE_TARGET, 0, 1);

  const usagePen = cfg.USAGE_MAX_PEN * (1 - usageFactor);
  const ballhogPen = cfg.BALLHOG_MAX_PEN * (1 - assistFactor);

  // Archetype balance by natural position.
  const roleCounts = { G: 0, W: 0, B: 0 } as Record<Role, number>;
  for (const p of roster) roleCounts[primaryRole(p)] += 1;
  let balancePen = 0;
  if (roleCounts.G === 0) balancePen += cfg.NO_GUARD_PEN;
  if (roleCounts.B === 0) balancePen += cfg.NO_BIG_PEN;
  const maxRole = Math.max(roleCounts.G, roleCounts.W, roleCounts.B);
  if (maxRole > 3) balancePen += cfg.SKEW_PEN * (maxRole - 3);

  // Synergy rewards a well-spaced, ball-moving, non-overloaded AND balanced
  // roster, scaled by talent — the only way to clear the bar for a perfect season.
  const fitRamp = Math.min(usageFactor, shootFactor, assistFactor);
  const synergyBonus =
    baseNet > 0 && balancePen === 0
      ? baseNet * cfg.SYNERGY_FRAC * fitRamp
      : 0;

  const netRating =
    baseNet - usagePen - outsidePen - ballhogPen - balancePen + synergyBonus;

  const wins = clamp(
    Math.round(cfg.BASE_WINS + cfg.WINS_PER_NET * netRating),
    0,
    cfg.GAMES,
  );

  // Minutes-extrapolated team box. Each starter's per-game line is taken per-36
  // and scaled to a full position: 36 starter minutes + the remaining 12 covered
  // by a bench player at 50% (= 6 effective minutes) → stat × 42 / mpg. Summed
  // across the five, this is a full-team per-game line; FG%/FT% derive from the
  // same minutes-weighted makes/attempts (the ×42 cancels in the ratio).
  //
  // Possession-consuming stats (scoring, assists, turnovers) are then scaled by
  // usageScale: an overloaded lineup of ball-dominant stars only realizes a
  // fraction of its combined shot diet, while an under-used lineup fills the
  // spare possessions and bumps up. Rebounds/steals/blocks aren't usage-
  // constrained, so they're left whole; FG%/FT% are unchanged (the scale would
  // cancel in the ratio, so it isn't applied to makes/attempts).
  const EFF_MIN = 42;
  const ext = (f: (p: ScoringPlayer) => number) =>
    roster.reduce((a, p) => a + (p.mpg > 0 ? (f(p) * EFF_MIN) / p.mpg : 0), 0);
  const u = usageScale;
  const teamBox = {
    pts: Math.round(ext((p) => p.pts) * u),
    reb: Math.round(ext((p) => p.reb)),
    ast: Math.round(ext((p) => p.ast) * u),
    stl: Math.round(ext((p) => p.stl)),
    blk: Math.round(ext((p) => p.blk)),
    fgPct: pctOf(ext((p) => p.fgm), ext((p) => p.fga)),
    ftPct: pctOf(ext((p) => p.ftm), ext((p) => p.fta)),
    tov: Math.round(ext((p) => p.tov) * u),
  };

  return {
    wins,
    losses: cfg.GAMES - wins,
    perfect: wins === cfg.GAMES,
    netRating: round1(netRating),
    baseNet: round1(baseNet),
    meanGQ: Math.round(meanGQ * 1000) / 1000,
    pf: teamBox.pts,
    pa: Math.round(teamBox.pts - netRating),
    usageFactor: round2(usageFactor),
    assistFactor: round2(assistFactor),
    nonShooters,
    totalAst: round1(totalAst),
    assistedPct: round2(assistedPct),
    usagePen: round1(usagePen),
    outsidePen: round1(outsidePen),
    ballhogPen: round1(ballhogPen),
    balancePen: round1(balancePen),
    synergyBonus: round1(synergyBonus),
    roleCounts,
    totalPoss: round1(totalPoss),
    teamBox,
  };
}
