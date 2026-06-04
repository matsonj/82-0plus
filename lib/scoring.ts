import type { SimResult } from "./types";
import { primaryRole, type Role } from "./positions";

/** A drafted player's box line plus their era-neutral Game Quality (peak-season median). */
export interface ScoringPlayer {
  gq: number;
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
 * Construction (the three factors that survive era-noise and aren't already
 * baked into GQ):
 *     • usage      — five ball-dominant stars can't all eat; possessions are a
 *                    fixed budget, so shot overlap throttles the lineup.
 *     • efficiency — era-relative true shooting (TS+). Rewards efficient stars
 *                    over volume chuckers; possession-weighted so an inefficient
 *                    high-usage scorer drags the team more. Era-fair: a 1962
 *                    volume year is measured against its own league, not today's.
 *     • balance    — by NATURAL position: no true guard (no real ball-handler /
 *                    perimeter D), no true big (no rim protection), or a lopsided
 *                    archetype (4+ of one).
 *     • synergy    — a small bonus for a roster that is efficient, isn't shot-
 *                    starved, AND is balanced: good construction is rewarded, not
 *                    just un-penalized. Gated so it can't manufacture net from a
 *                    flawed roster.
 *
 * Spacing (3PM), playmaking (AST) and defense (STL+BLK) volume penalties were
 * removed: they lean on exactly the stats the NBA didn't track pre-1980, and
 * are largely already captured inside GQ.
 *
 * Wins:  wins = 41 + 2.7 × netRating (nbastuffer projected win%). 82-0 ⇒ ≈ +15.2
 *   net — reachable only by an elite, efficient, balanced, non-overlapping core.
 */
export const SCORING_CONFIG = {
  GAMES: 82,
  AVG_GQ: 0.5,
  NET_PER_GQ: 40,
  WINS_PER_NET: 2.7,
  BASE_WINS: 41,

  // Fit penalties, in net-rating points subtracted at their worst.
  USAGE_MAX_PEN: 10,
  EFF_MAX_PEN: 8,

  // Archetype-balance penalties (by natural position).
  NO_GUARD_PEN: 9, // no true ball-handler / perimeter defender
  NO_BIG_PEN: 7, // no true rim protection / rebounding
  SKEW_PEN: 3, // per player beyond 3 sharing one natural position

  // Construction synergy: an elite-efficiency, non-overlapping, balanced roster
  // amplifies talent. Gated on ELITE efficiency (EFF_ELITE), so it — not a raw
  // penalty — is what makes 82-0 demand efficient stars.
  SYNERGY_FRAC: 0.12, // up to +12% of base net rating

  // Fit targets.
  POSS_BUDGET_PER_SLOT: 22, // possessions (fga + 0.44·fta + tov) one slot can absorb
  EFF_FLOOR: 0.85, // team TS+ at/below this → full efficiency penalty
  EFF_PAR: 1.0, // league-average TS+ → no efficiency penalty (neutral)
  EFF_ELITE: 1.12, // team TS+ at/above this → full synergy eligibility

  // Implied scoreline for display only.
  BASE_PPG: 112,
} as const;

export type ScoringConfig = typeof SCORING_CONFIG;

const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));
const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;

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
      wins: 0, losses: cfg.GAMES, perfect: false, netRating: 0, meanGQ: 0,
      pf: cfg.BASE_PPG, pa: cfg.BASE_PPG,
      usageFactor: 1, efficiencyFactor: 1, teamTsPlus: 1,
      usagePen: 0, effPen: 0, balancePen: 0, synergyBonus: 0,
      roleCounts: { G: 0, W: 0, B: 0 },
      totalPoss: 0,
    };
  }

  const sum = (f: (p: ScoringPlayer) => number) =>
    roster.reduce((acc, p) => acc + f(p), 0);
  const poss = (p: ScoringPlayer) => p.fga + 0.44 * p.fta + p.tov;

  const meanGQ = sum((p) => p.gq) / n;
  const totalPoss = sum(poss);

  // Possession-weighted team TS+ — an inefficient high-volume scorer drags the
  // shot diet more than an efficient role player lifts it. Guard against a
  // missing per-player tsplus (defaults to league-average) so it can't NaN.
  const ts = (p: ScoringPlayer) => (Number.isFinite(p.tsplus) ? p.tsplus : 1);
  const teamTsPlusRaw =
    totalPoss > 0 ? sum((p) => ts(p) * poss(p)) / totalPoss : 1;
  const teamTsPlus = Number.isFinite(teamTsPlusRaw) ? teamTsPlusRaw : 1;

  // Era-neutral team quality → base net rating.
  const baseNet = cfg.NET_PER_GQ * (meanGQ - cfg.AVG_GQ);

  // Fit factors in [0, 1] (1 = no problem).
  const usageFactor = Math.min(
    1,
    (n * cfg.POSS_BUDGET_PER_SLOT) / Math.max(totalPoss, 1e-9),
  );
  // Efficiency only penalizes BELOW league-average TS+ (par = no penalty);
  // above-average efficiency earns its upside through the synergy gate below.
  const efficiencyFactor = clamp(
    (teamTsPlus - cfg.EFF_FLOOR) / (cfg.EFF_PAR - cfg.EFF_FLOOR),
    0,
    1,
  );

  const usagePen = cfg.USAGE_MAX_PEN * (1 - usageFactor);
  const effPen = cfg.EFF_MAX_PEN * (1 - efficiencyFactor);

  // Archetype balance by natural position.
  const roleCounts = { G: 0, W: 0, B: 0 } as Record<Role, number>;
  for (const p of roster) roleCounts[primaryRole(p)] += 1;
  let balancePen = 0;
  if (roleCounts.G === 0) balancePen += cfg.NO_GUARD_PEN;
  if (roleCounts.B === 0) balancePen += cfg.NO_BIG_PEN;
  const maxRole = Math.max(roleCounts.G, roleCounts.W, roleCounts.B);
  if (maxRole > 3) balancePen += cfg.SKEW_PEN * (maxRole - 3);

  // Synergy rewards an ELITE-efficiency, non-overlapping AND balanced roster,
  // scaled by talent. Elite-efficiency eligibility ramps from par to EFF_ELITE.
  const effSynergy = clamp(
    (teamTsPlus - cfg.EFF_PAR) / (cfg.EFF_ELITE - cfg.EFF_PAR),
    0,
    1,
  );
  const fitRamp = Math.min(usageFactor, effSynergy);
  const synergyBonus =
    baseNet > 0 && balancePen === 0
      ? baseNet * cfg.SYNERGY_FRAC * fitRamp
      : 0;

  const netRating = baseNet - usagePen - effPen - balancePen + synergyBonus;

  const wins = clamp(
    Math.round(cfg.BASE_WINS + cfg.WINS_PER_NET * netRating),
    0,
    cfg.GAMES,
  );

  return {
    wins,
    losses: cfg.GAMES - wins,
    perfect: wins === cfg.GAMES,
    netRating: round1(netRating),
    meanGQ: Math.round(meanGQ * 1000) / 1000,
    pf: round1(cfg.BASE_PPG + netRating / 2),
    pa: round1(cfg.BASE_PPG - netRating / 2),
    usageFactor: round2(usageFactor),
    efficiencyFactor: round2(efficiencyFactor),
    teamTsPlus: round2(teamTsPlus),
    usagePen: round1(usagePen),
    effPen: round1(effPen),
    balancePen: round1(balancePen),
    synergyBonus: round1(synergyBonus),
    roleCounts,
    totalPoss: round1(totalPoss),
  };
}
