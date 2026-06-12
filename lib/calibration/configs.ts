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
 * v1 candidates. The directional hypotheses behind the calibration:
 *  - matchup height and reg-season size/defense boosts over-reward tall teams;
 *  - frontcourt stacks beat balanced / perimeter-led builds too easily;
 *  - elite perimeter creators end up materially below comparable elite bigs.
 * Each candidate nudges existing knobs to test one (or a blend) of these.
 */
export const CANDIDATES: CandidateConfig[] = [
  {
    name: "current",
    description: "Live defaults — the baseline every other candidate is judged against.",
    scoringOverrides: {},
    tournamentOverrides: {},
  },
  {
    name: "reduce-matchup-height",
    description:
      "Lower the tournament per-game height edge (HEIGHT_PER_INCH 0.15→0.10, HEIGHT_CAP 3.0→2.0) so a taller five wins fewer games on size alone.",
    scoringOverrides: {},
    tournamentOverrides: { HEIGHT_PER_INCH: 0.1, HEIGHT_CAP: 2.0 },
  },
  {
    name: "reduce-rating-size-defense",
    description:
      "Soften the reg-season size + defense boosts: smaller too-short penalty, less All-Def effective height, smaller defensive margin bonus.",
    scoringOverrides: {
      SIZE_MAX_PEN: 3,
      DEF_HEIGHT_1ST: 2,
      DEF_HEIGHT_2ND: 1,
      DEF_MARGIN_1ST: 1.0,
      DEF_MARGIN_2ND: 0.5,
      DEF_MARGIN_CAP: 3,
    },
    tournamentOverrides: {},
  },
  {
    name: "frontcourt-tax",
    description:
      "Tax frontcourt-skewed builds harder (no-guard, position skew, non-shooters) and let the fit floor rescue a touch less, so all-big stacks pay more.",
    scoringOverrides: {
      NO_GUARD_PEN: 13,
      SKEW_PEN: 5,
      OUTSIDE_PEN_2: 7,
      OUTSIDE_PEN_3PLUS: 20,
      FLOOR_TALENT_SHARE: 0.4,
      MAX_FIT_PENALTY: 18,
    },
    tournamentOverrides: {},
  },
  {
    name: "creation-synergy",
    description:
      "Reward creation, spacing and ball movement: bigger synergy ceiling, harsher ball-hog tax, slightly easier assist target.",
    scoringOverrides: {
      SYNERGY_FRAC: 0.18,
      BALLHOG_MAX_PEN: 15,
      ASSIST_RATE_TARGET: 0.5,
    },
    tournamentOverrides: {},
  },
  {
    name: "combined-lite",
    description:
      "A gentle blend of all four directions — modest height trim, modest size/defense trim, modest frontcourt tax, modest creation reward.",
    scoringOverrides: {
      SIZE_MAX_PEN: 4,
      DEF_MARGIN_CAP: 4,
      NO_GUARD_PEN: 11,
      BALLHOG_MAX_PEN: 13,
      SYNERGY_FRAC: 0.15,
    },
    tournamentOverrides: { HEIGHT_PER_INCH: 0.12, HEIGHT_CAP: 2.5 },
  },
  {
    name: "combined-strong",
    description:
      "A strong blend of all four directions — the full height trim, size/defense trim, frontcourt tax and creation reward stacked together.",
    scoringOverrides: {
      SIZE_MAX_PEN: 3,
      DEF_HEIGHT_1ST: 2,
      DEF_HEIGHT_2ND: 1,
      DEF_MARGIN_1ST: 1.0,
      DEF_MARGIN_2ND: 0.5,
      DEF_MARGIN_CAP: 3,
      NO_GUARD_PEN: 13,
      SKEW_PEN: 5,
      OUTSIDE_PEN_2: 7,
      OUTSIDE_PEN_3PLUS: 20,
      SYNERGY_FRAC: 0.18,
      BALLHOG_MAX_PEN: 15,
      ASSIST_RATE_TARGET: 0.5,
      FLOOR_TALENT_SHARE: 0.4,
      MAX_FIT_PENALTY: 18,
    },
    tournamentOverrides: { HEIGHT_PER_INCH: 0.1, HEIGHT_CAP: 2.0 },
  },

  // ── Round 2: pull the levers harder. combined-strong only halved the
  //    tall-stack tournament share (≈57%, fair ≈25%), so these push the two
  //    mechanisms that keep bigs on top: the tournament per-game height edge,
  //    and the penalty floor that rescues bad-fit-but-talented stacks (keeping
  //    their seedNet — hence their seed — high). The last one deliberately
  //    overshoots to find the over-correction boundary (the realism floor).
  {
    name: "height-edge-min",
    description:
      "Isolate the tournament lever: nearly remove the per-game height edge (HEIGHT_PER_INCH 0.15→0.06, HEIGHT_CAP 3.0→1.0), nothing else.",
    scoringOverrides: {},
    tournamentOverrides: { HEIGHT_PER_INCH: 0.06, HEIGHT_CAP: 1.0 },
  },
  {
    name: "combined-max",
    description:
      "combined-strong pushed harder on every lever — deeper height trim, smaller size/defense boosts, heavier frontcourt tax, more creation reward, and a looser floor so construction penalties actually bite seedNet.",
    scoringOverrides: {
      SIZE_MAX_PEN: 2,
      DEF_HEIGHT_1ST: 1,
      DEF_HEIGHT_2ND: 0.5,
      DEF_MARGIN_1ST: 0.75,
      DEF_MARGIN_2ND: 0.4,
      DEF_MARGIN_CAP: 2,
      NO_GUARD_PEN: 16,
      SKEW_PEN: 7,
      OUTSIDE_PEN_2: 9,
      OUTSIDE_PEN_3PLUS: 26,
      SYNERGY_FRAC: 0.22,
      BALLHOG_MAX_PEN: 18,
      ASSIST_RATE_TARGET: 0.5,
      FLOOR_TALENT_SHARE: 0.3,
      MAX_FIT_PENALTY: 24,
    },
    tournamentOverrides: { HEIGHT_PER_INCH: 0.06, HEIGHT_CAP: 1.25 },
  },
  {
    name: "combined-max-floor",
    description:
      "combined-max plus a much lower penalty floor (FLOOR_TALENT_SHARE 0.5→0.25, MAX_FIT_PENALTY 15→30) so frontcourt stacks lose seed, not just games. Intentionally aggressive — expected to test the realism floor (bigs must stay excellent).",
    scoringOverrides: {
      SIZE_MAX_PEN: 2,
      DEF_HEIGHT_1ST: 1,
      DEF_HEIGHT_2ND: 0.5,
      DEF_MARGIN_1ST: 0.75,
      DEF_MARGIN_2ND: 0.4,
      DEF_MARGIN_CAP: 2,
      NO_GUARD_PEN: 16,
      SKEW_PEN: 7,
      OUTSIDE_PEN_2: 9,
      OUTSIDE_PEN_3PLUS: 26,
      SYNERGY_FRAC: 0.22,
      BALLHOG_MAX_PEN: 18,
      ASSIST_RATE_TARGET: 0.5,
      FLOOR_TALENT_SHARE: 0.25,
      MAX_FIT_PENALTY: 30,
    },
    tournamentOverrides: { HEIGHT_PER_INCH: 0.06, HEIGHT_CAP: 1.25 },
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
