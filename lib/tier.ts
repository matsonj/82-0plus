// Tournament tiers — a team's "bracket" placement, keyed off its projected
// regular-season win total. The projection mirrors lib/scoring (and the
// TournamentResults card): wins = clamp(round(BASE_WINS + WINS_PER_NET·seedNet)).
//
//   S  — 82 wins (a perfect, undefeated team)
//   AA — 80–81
//   A  — 70–79
//   B  — 60–69
//   C  — 50–59
//   D  — 40–49
//   (under 40 wins → NOT tournament-eligible: tierForWins returns null)
//
// Tiers drive three things: a display badge, the entry eligibility gate, and
// tier-segmented matchmaking (you face teams in your own tier).

import { SCORING_CONFIG } from "./scoring";

/** Project a seedNet (the five's buff-free net rating) to an 82-game win total,
 *  clamped to [0, 82]. The single source of truth for the reg-season record. */
export function regWinsFromSeedNet(seedNet: number): number {
  const w = Math.round(
    SCORING_CONFIG.BASE_WINS + SCORING_CONFIG.WINS_PER_NET * seedNet,
  );
  return Math.max(0, Math.min(SCORING_CONFIG.GAMES, w));
}

export type TierKey = "S" | "AA" | "A" | "B" | "C" | "D";

export interface TierInfo {
  key: TierKey;
  label: string;
  /** Inclusive win floor for this tier (the ceiling is the next tier's floor − 1,
   *  or 82 for S). */
  minWins: number;
  /** A CSS color (brand var) for the badge background. */
  color: string;
}

// Highest first. minWins is the inclusive lower bound; the bands are contiguous
// from 40 up to 82, so a tier owns [minWins, nextTier.minWins − 1].
export const TIERS: readonly TierInfo[] = [
  { key: "S", label: "S", minWins: 82, color: "var(--md-yellow)" },
  { key: "AA", label: "AA", minWins: 80, color: "var(--md-teal)" },
  { key: "A", label: "A", minWins: 70, color: "var(--md-sky)" },
  { key: "B", label: "B", minWins: 60, color: "var(--md-orange)" },
  { key: "C", label: "C", minWins: 50, color: "var(--md-orange-deep)" },
  { key: "D", label: "D", minWins: 40, color: "var(--md-ink-muted)" },
] as const;

/** The minimum projected wins to be tournament-eligible (the D-tier floor). */
export const MIN_ELIGIBLE_WINS = 40;

/** Tier for a projected win total, or null if under 40 wins (ineligible). */
export function tierForWins(wins: number): TierInfo | null {
  for (const t of TIERS) {
    if (wins >= t.minWins) return t;
  }
  return null;
}

/** Tier straight from a seedNet, or null if the team projects under 40 wins. */
export function tierForSeedNet(seedNet: number): TierInfo | null {
  return tierForWins(regWinsFromSeedNet(seedNet));
}

/** True iff a seedNet projects to a tournament-eligible team (≥ 40 wins). */
export function isEligible(seedNet: number): boolean {
  return regWinsFromSeedNet(seedNet) >= MIN_ELIGIBLE_WINS;
}
