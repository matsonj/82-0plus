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

const COMBINED_MAX_SCORING: CandidateConfig["scoringOverrides"] = {
  OVERSIZE_MAX_PEN: 0,
};

const COMBINED_MAX_TOURNAMENT: CandidateConfig["tournamentOverrides"] = {
  HEIGHT_PER_INCH: 0.06,
  HEIGHT_CAP: 1.25,
  GAMESCORE_CATEGORIES: "legacy",
  PACE_ADJUST_GAMESCORE: false,
};

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
      "Live defaults (the adopted height-aware v2 tuning) — the baseline every other candidate is judged against.",
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
    scoringOverrides: { ...COMBINED_MAX_SCORING },
    tournamentOverrides: { ...COMBINED_MAX_TOURNAMENT, HEIGHT_CAP: 1.0 },
  },
  {
    name: "combined-max-floor",
    description:
      "Forward stress test: push the penalty floor lower than the adopted tuning (FLOOR_TALENT_SHARE 0.3→0.25, MAX_FIT_PENALTY 24→30) so stacks lose even more seed. Watches the realism floor (bigs must stay excellent).",
    scoringOverrides: {
      ...COMBINED_MAX_SCORING,
      FLOOR_TALENT_SHARE: 0.25,
      MAX_FIT_PENALTY: 30,
    },
    tournamentOverrides: { ...COMBINED_MAX_TOURNAMENT },
  },

  // ── Height-aware levers (each isolates ONE knob so its effect is legible). All
  // are anchored to the pre-height-aware combined-max baseline above; otherwise
  // the adopted live defaults would turn these candidates into no-ops. ──
  {
    name: "pace-adj",
    description:
      "Lever F: pace-adjust the bracket game-score totals (removes the high-pace old-era free edge). Bracket-only.",
    scoringOverrides: { ...COMBINED_MAX_SCORING },
    tournamentOverrides: {
      ...COMBINED_MAX_TOURNAMENT,
      PACE_ADJUST_GAMESCORE: true,
    },
  },
  {
    name: "gamescore-rebalanced",
    description:
      "Lever A: rebalanced game-score categories — folds reb+blk to ~one 'size' category and adds a 3pt/spacing category so size can't sweep. Bracket-only.",
    scoringOverrides: { ...COMBINED_MAX_SCORING },
    tournamentOverrides: {
      ...COMBINED_MAX_TOURNAMENT,
      GAMESCORE_CATEGORIES: "rebalanced",
    },
  },
  {
    name: "height-trim",
    description:
      "Lever B: halve the per-game height edge (HEIGHT_PER_INCH 0.06→0.03, HEIGHT_CAP 1.25→0.6). Bracket-only.",
    scoringOverrides: { ...COMBINED_MAX_SCORING },
    tournamentOverrides: {
      ...COMBINED_MAX_TOURNAMENT,
      HEIGHT_PER_INCH: 0.03,
      HEIGHT_CAP: 0.6,
    },
  },
  {
    name: "seed-oversize",
    description:
      "Seed lever: turn on the excess-frontcourt-height penalty (OVERSIZE_MAX_PEN 0→6). Seed-only — taxes oversized fives' seed.",
    scoringOverrides: { OVERSIZE_MAX_PEN: 6 },
    tournamentOverrides: { ...COMBINED_MAX_TOURNAMENT },
  },
  {
    name: "height-aware-combined",
    description:
      "All height-aware levers together (A+B+F + seed oversize). The candidate to beat for the real tall-lift while keeping one-big-balanced / elite bigs excellent.",
    scoringOverrides: { OVERSIZE_MAX_PEN: 6 },
    tournamentOverrides: {
      ...COMBINED_MAX_TOURNAMENT,
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

  // ── Count-based oversize strength sweep (diffs against the LIVE default, which is
  // already the count-based v2 retune). Only the oversize knobs vary; all other
  // height-aware levers stay on, so this isolates how hard to tax the 3rd+ big. ──
  {
    name: "oversize-off",
    description:
      "Bracket levers only (OVERSIZE_MAX_PEN 0) — the no-seed-penalty ceiling the oversize tax is tuned down from.",
    scoringOverrides: { OVERSIZE_MAX_PEN: 0 },
    tournamentOverrides: {},
  },
  {
    name: "oversize-count-1",
    description:
      "Count-based oversize, very gentle: OVERSIZE_PER_TALL 1, MAX_PEN 3. A 3-big lineup pays 1 net.",
    scoringOverrides: { OVERSIZE_PER_TALL: 1, OVERSIZE_MAX_PEN: 3 },
    tournamentOverrides: {},
  },
  {
    name: "oversize-count-2",
    description:
      "Count-based oversize, gentle: OVERSIZE_PER_TALL 2, MAX_PEN 5. A 3-big lineup pays 2 net.",
    scoringOverrides: { OVERSIZE_PER_TALL: 2, OVERSIZE_MAX_PEN: 5 },
    tournamentOverrides: {},
  },
  {
    name: "oversize-count-soft",
    description:
      "Count-based oversize, softer: OVERSIZE_PER_TALL 5→3, MAX_PEN 12→9. A 3-big lineup pays 3 net.",
    scoringOverrides: { OVERSIZE_PER_TALL: 3, OVERSIZE_MAX_PEN: 9 },
    tournamentOverrides: {},
  },
  {
    name: "oversize-count-hard",
    description:
      "Count-based oversize, harder: OVERSIZE_PER_TALL 5→7, MAX_PEN 12→15. A 3-big lineup pays 7 net.",
    scoringOverrides: { OVERSIZE_PER_TALL: 7, OVERSIZE_MAX_PEN: 15 },
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
