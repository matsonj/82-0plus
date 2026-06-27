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
 * The HEIGHT-AWARE retune then adopted (now also live in the defaults): a seed
 * oversize-height penalty + a pace-adjusted, rebalanced bracket game score + a
 * gentler per-game height edge. On real ranked replays it cut the 3+-tall champion
 * lift from ~2.2× toward ~1.3× and the "unicorn" stack's title rate from ~12% to
 * ~2%, while the one-big-balanced control held/rose. `current` now equals that.
 *
 * The remaining candidates are the comparison points worth keeping: a full revert
 * to the pre-calibration constants, the per-lever isolations + the combined sets
 * (`height-aware-*`, now ≈ the live default), and two earlier stress tests.
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
      OVERSIZE_MAX_PEN: 0, // undo the height-aware seed oversize penalty
    },
    tournamentOverrides: {
      HEIGHT_PER_INCH: 0.15,
      HEIGHT_CAP: 3.0,
      // undo the height-aware bracket changes so this is a true full revert
      GAMESCORE_CATEGORIES: "legacy",
      PACE_ADJUST_GAMESCORE: false,
    },
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

  // ── Height-aware levers (each isolates ONE knob so its effect is legible). All
  // values are STARTING points for Phase-2 tuning, not final — adjust against the
  // real tall-lift + prebaked scoreboard before any default is flipped. ──
  {
    name: "pace-adj",
    description:
      "Lever F: pace-adjust the bracket game-score totals (removes the high-pace old-era free edge). Bracket-only.",
    scoringOverrides: {},
    tournamentOverrides: { PACE_ADJUST_GAMESCORE: true },
  },
  {
    name: "gamescore-rebalanced",
    description:
      "Lever A: rebalanced game-score categories — folds reb+blk to ~one 'size' category and adds a 3pt/spacing category so size can't sweep. Bracket-only.",
    scoringOverrides: {},
    tournamentOverrides: { GAMESCORE_CATEGORIES: "rebalanced" },
  },
  {
    name: "height-trim",
    description:
      "Lever B: halve the per-game height edge (HEIGHT_PER_INCH 0.06→0.03, HEIGHT_CAP 1.25→0.6). Bracket-only.",
    scoringOverrides: {},
    tournamentOverrides: { HEIGHT_PER_INCH: 0.03, HEIGHT_CAP: 0.6 },
  },
  {
    name: "seed-oversize",
    description:
      "Seed lever: turn on the excess-frontcourt-height penalty (OVERSIZE_MAX_PEN 0→6). Seed-only — taxes oversized fives' seed.",
    scoringOverrides: { OVERSIZE_MAX_PEN: 6 },
    tournamentOverrides: {},
  },
  {
    name: "height-aware-combined",
    description:
      "All height-aware levers together (A+B+F + seed oversize). The candidate to beat for the real tall-lift while keeping one-big-balanced / elite bigs excellent.",
    scoringOverrides: { OVERSIZE_MAX_PEN: 6 },
    tournamentOverrides: {
      PACE_ADJUST_GAMESCORE: true,
      GAMESCORE_CATEGORIES: "rebalanced",
      HEIGHT_PER_INCH: 0.03,
      HEIGHT_CAP: 0.6,
    },
  },
  {
    name: "height-aware-v2",
    description:
      "Softer combined: keeps the workhorses (seed-oversize + pace-adj + rebalanced) but eases the blunt height-trim (HEIGHT_PER_INCH 0.045, HEIGHT_CAP 0.9) so a genuinely great tall team still gets a small edge — targets a real tall-lift of ~1.3–1.5× (not fully neutral) with the unicorn exploit still suppressed and one-big-balanced intact.",
    scoringOverrides: { OVERSIZE_MAX_PEN: 6 },
    tournamentOverrides: {
      PACE_ADJUST_GAMESCORE: true,
      GAMESCORE_CATEGORIES: "rebalanced",
      HEIGHT_PER_INCH: 0.045,
      HEIGHT_CAP: 0.9,
    },
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
