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
}

/**
 * Roster → record model, grounded in published methods.
 *
 * Quality:  Game Quality (GQ) is the core — era-neutral by construction (a player
 *   is scored only against his contemporaries that week), so a 2002 star and a
 *   2024 star are directly comparable. GQ is two-way (reb/stl/blk/turnovers).
 *   League-average ≈ .50.
 *
 * Team rating:  meanGQ above .500 → a base net rating, then construction penalties:
 *     • usage      — five ball-dominant stars can't all eat (possession budget)
 *     • spacing    — too few made 3s
 *     • playmaking — too few assists
 *     • defense    — too few steals + blocks
 *     • balance    — by NATURAL position: no true guard (no real ball-handler /
 *                    perimeter D), no true big (no rim protection), or a lopsided
 *                    archetype (4+ of one). The draft fills G/FLEX/W/FLEX/B with
 *                    eligible players, but a combo wing can fill the guard slot —
 *                    so an all-frontcourt lineup is still penalized here.
 *     • synergy    — a flawlessly built AND balanced roster amplifies its talent
 *                    (good construction is rewarded, not just un-penalized).
 *
 * Wins:  wins = 41 + 2.7 × netRating (nbastuffer projected win%). 82-0 ⇒ ≈ +15.2
 *   net — reachable by an elite, balanced, flawlessly-fit core.
 */
export const SCORING_CONFIG = {
  GAMES: 82,
  AVG_GQ: 0.5,
  NET_PER_GQ: 47,
  WINS_PER_NET: 2.7,
  BASE_WINS: 41,

  // Fit penalties, in net-rating points subtracted at their worst.
  USAGE_MAX_PEN: 12,
  SPACING_MAX_PEN: 9,
  PLAYMAKING_MAX_PEN: 7,
  DEFENSE_MAX_PEN: 8,

  // Archetype-balance penalties (by natural position).
  NO_GUARD_PEN: 9, // no true ball-handler / perimeter defender
  NO_BIG_PEN: 7, // no true rim protection / rebounding
  SKEW_PEN: 3, // per player beyond 3 sharing one natural position

  // Construction synergy: a flawlessly built AND balanced roster amplifies talent.
  SYNERGY_FRAC: 0.22, // up to +22% of base net rating
  SYNERGY_FIT_FLOOR: 0.85, // every fit factor must clear this before synergy starts

  // Fit targets (absolute / modern floor), per roster slot.
  POSS_BUDGET_PER_SLOT: 22,
  AST_TARGET_PER_SLOT: 4,
  THREES_TARGET_PER_SLOT: 1.8,
  STOCKS_TARGET_PER_SLOT: 1.5,

  // Implied scoreline for display only.
  BASE_PPG: 112,
} as const;

export type ScoringConfig = typeof SCORING_CONFIG;

const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));
const round1 = (x: number) => Math.round(x * 10) / 10;

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
      usageFactor: 1, pAst: 1, p3: 1, defenseFactor: 1,
      usagePen: 0, spacingPen: 0, playmakingPen: 0, defensePen: 0,
      balancePen: 0, synergyBonus: 0,
      roleCounts: { G: 0, W: 0, B: 0 },
      totalPoss: 0, totalAst: 0, total3m: 0, totalStocks: 0,
    };
  }

  const sum = (f: (p: ScoringPlayer) => number) =>
    roster.reduce((acc, p) => acc + f(p), 0);

  const meanGQ = sum((p) => p.gq) / n;
  const totalPoss = sum((p) => p.fga + 0.44 * p.fta + p.tov);
  const totalAst = sum((p) => p.ast);
  const total3m = sum((p) => p.fg3m);
  const totalStocks = sum((p) => p.stl + p.blk);

  // Era-neutral team quality → base net rating.
  const baseNet = cfg.NET_PER_GQ * (meanGQ - cfg.AVG_GQ);

  // Fit factors in [0, 1] (1 = no problem).
  const usageFactor = Math.min(
    1,
    (n * cfg.POSS_BUDGET_PER_SLOT) / Math.max(totalPoss, 1e-9),
  );
  const pAst = Math.min(1, totalAst / (n * cfg.AST_TARGET_PER_SLOT));
  const p3 = Math.min(1, total3m / (n * cfg.THREES_TARGET_PER_SLOT));
  const defenseFactor = Math.min(
    1,
    totalStocks / (n * cfg.STOCKS_TARGET_PER_SLOT),
  );

  const usagePen = cfg.USAGE_MAX_PEN * (1 - usageFactor);
  const spacingPen = cfg.SPACING_MAX_PEN * (1 - p3);
  const playmakingPen = cfg.PLAYMAKING_MAX_PEN * (1 - pAst);
  const defensePen = cfg.DEFENSE_MAX_PEN * (1 - defenseFactor);

  // Archetype balance by natural position.
  const roleCounts = { G: 0, W: 0, B: 0 } as Record<Role, number>;
  for (const p of roster) roleCounts[primaryRole(p)] += 1;
  let balancePen = 0;
  if (roleCounts.G === 0) balancePen += cfg.NO_GUARD_PEN;
  if (roleCounts.B === 0) balancePen += cfg.NO_BIG_PEN;
  const maxRole = Math.max(roleCounts.G, roleCounts.W, roleCounts.B);
  if (maxRole > 3) balancePen += cfg.SKEW_PEN * (maxRole - 3);

  // Synergy rewards flawless fit, but only on a balanced roster, scaled by talent.
  const fitQuality = Math.min(usageFactor, pAst, p3, defenseFactor);
  const fitRamp = clamp(
    (fitQuality - cfg.SYNERGY_FIT_FLOOR) / (1 - cfg.SYNERGY_FIT_FLOOR),
    0,
    1,
  );
  const synergyBonus =
    baseNet > 0 && balancePen === 0
      ? baseNet * cfg.SYNERGY_FRAC * fitRamp
      : 0;

  const netRating =
    baseNet -
    usagePen -
    spacingPen -
    playmakingPen -
    defensePen -
    balancePen +
    synergyBonus;

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
    usageFactor: Math.round(usageFactor * 100) / 100,
    pAst: Math.round(pAst * 100) / 100,
    p3: Math.round(p3 * 100) / 100,
    defenseFactor: Math.round(defenseFactor * 100) / 100,
    usagePen: round1(usagePen),
    spacingPen: round1(spacingPen),
    playmakingPen: round1(playmakingPen),
    defensePen: round1(defensePen),
    balancePen: round1(balancePen),
    synergyBonus: round1(synergyBonus),
    roleCounts,
    totalPoss: round1(totalPoss),
    totalAst: round1(totalAst),
    total3m: round1(total3m),
    totalStocks: round1(totalStocks),
  };
}
