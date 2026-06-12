// ============================================================================
// Candidate config registry.
//
// Each candidate is a set of PARTIAL numeric overrides off the live defaults
// (SCORING_CONFIG / TOURNAMENT_CONFIG). `resolveCandidate` merges them onto the
// defaults to produce a full config for simulateRoster / simulateBracket. The
// live default objects are never mutated — a candidate is always a fresh spread.
// ============================================================================

import { SCORING_CONFIG } from "../scoring";
import { TOURNAMENT_CONFIG } from "../tournament";
import type { CandidateConfig, ResolvedCandidate } from "./types";

/**
 * Candidates are PARTIAL diffs against the LIVE defaults. The calibration adopted
 * the "combined-max" tuning as the live baseline (see SCORING_CONFIG /
 * TOURNAMENT_CONFIG), which:
 *  - trims the tournament per-game height edge and the reg-season size/defense
 *    boosts that over-rewarded tall teams;
 *  - taxes frontcourt-skewed (no-guard / non-shooter) builds harder;
 *  - rewards creation, spacing and ball movement;
 *  - loosens the penalty floor so a bad-fit stack loses SEED, not just games.
 * That dropped tall frontcourt stacks from ~88% of bracket titles to ~31% (fair
 * ≈ 25%) while keeping elite bigs excellent (~66 projected wins).
 *
 * The remaining candidates are the comparison points worth keeping: a full revert
 * to the pre-calibration constants (to reproduce the before/after at any time)
 * and two forward stress tests that push past the adopted tuning.
 */
export const CANDIDATES: CandidateConfig[] = [
  {
    name: "current",
    description:
      "Live defaults (the adopted combined-max tuning) — the baseline every other candidate is judged against.",
    scoringOverrides: {},
    tournamentOverrides: {},
  },
  {
    name: "legacy-pre-calibration",
    description:
      "Full revert to the pre-calibration constants. Reproduces the original behavior (tall stacks ~88% of titles) for before/after comparison.",
    scoringOverrides: {
      BALLHOG_MAX_PEN: 11,
      OUTSIDE_PEN_2: 5,
      OUTSIDE_PEN_3PLUS: 15,
      NO_GUARD_PEN: 9,
      SKEW_PEN: 3,
      SIZE_MAX_PEN: 6,
      DEF_HEIGHT_1ST: 4,
      DEF_HEIGHT_2ND: 2,
      DEF_MARGIN_1ST: 1.5,
      DEF_MARGIN_2ND: 0.75,
      DEF_MARGIN_CAP: 5,
      SYNERGY_FRAC: 0.12,
      ASSIST_RATE_TARGET: 0.55,
      FLOOR_TALENT_SHARE: 0.5,
      MAX_FIT_PENALTY: 15,
    },
    tournamentOverrides: { HEIGHT_PER_INCH: 0.15, HEIGHT_CAP: 3.0 },
  },
  {
    name: "height-edge-min",
    description:
      "Forward stress test: tighten the tournament height cap further than the adopted tuning (HEIGHT_CAP 1.25→1.0).",
    scoringOverrides: {},
    tournamentOverrides: { HEIGHT_CAP: 1.0 },
  },
  {
    name: "combined-max-floor",
    description:
      "Forward stress test: push the penalty floor lower than the adopted tuning (FLOOR_TALENT_SHARE 0.3→0.25, MAX_FIT_PENALTY 24→30) so stacks lose even more seed. Watches the realism floor (bigs must stay excellent).",
    scoringOverrides: { FLOOR_TALENT_SHARE: 0.25, MAX_FIT_PENALTY: 30 },
    tournamentOverrides: {},
  },
];

/** Merge a candidate's partial overrides onto the live defaults. The defaults
 *  are spread (never mutated), so every resolve produces a fresh config. */
export function resolveCandidate(c: CandidateConfig): ResolvedCandidate {
  return {
    ...c,
    scoring: { ...SCORING_CONFIG, ...c.scoringOverrides },
    tournament: { ...TOURNAMENT_CONFIG, ...c.tournamentOverrides },
  };
}

/** Resolve candidates by name, in the order requested. Unknown names throw. */
export function resolveCandidates(names: string[]): ResolvedCandidate[] {
  const byName = new Map(CANDIDATES.map((c) => [c.name, c]));
  return names.map((name) => {
    const c = byName.get(name);
    if (!c) {
      throw new Error(
        `unknown candidate "${name}". known: ${CANDIDATES.map((x) => x.name).join(", ")}`,
      );
    }
    return resolveCandidate(c);
  });
}

/** All candidate names, in registry order. */
export function allCandidateNames(): string[] {
  return CANDIDATES.map((c) => c.name);
}
