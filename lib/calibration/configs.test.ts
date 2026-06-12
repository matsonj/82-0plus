import { describe, it, expect } from "vitest";
import { CANDIDATES, resolveCandidate, resolveCandidates, allCandidateNames } from "./configs";
import { SCORING_CONFIG } from "../scoring";
import { TOURNAMENT_CONFIG } from "../tournament";

describe("candidate configs", () => {
  it("registers the candidate set including current and the round-2 aggressive configs", () => {
    expect(allCandidateNames()).toEqual([
      "current",
      "reduce-matchup-height",
      "reduce-rating-size-defense",
      "frontcourt-tax",
      "creation-synergy",
      "combined-lite",
      "combined-strong",
      "height-edge-min",
      "combined-max",
      "combined-max-floor",
    ]);
  });

  it("merges overrides onto the live defaults", () => {
    const r = resolveCandidate(
      CANDIDATES.find((c) => c.name === "reduce-matchup-height")!,
    );
    expect(r.tournament.HEIGHT_PER_INCH).toBe(0.1);
    expect(r.tournament.HEIGHT_CAP).toBe(2.0);
    // an un-overridden tournament knob keeps its default
    expect(r.tournament.HOME_BUFF).toBe(TOURNAMENT_CONFIG.HOME_BUFF);
    // scoring is untouched for this candidate
    expect(r.scoring.NET_PER_GQ).toBe(SCORING_CONFIG.NET_PER_GQ);
  });

  it("current candidate equals the live defaults", () => {
    const r = resolveCandidate(CANDIDATES.find((c) => c.name === "current")!);
    expect(r.scoring).toEqual(SCORING_CONFIG);
    expect(r.tournament).toEqual(TOURNAMENT_CONFIG);
  });

  it("leaves the live default objects unmutated after resolving every candidate", () => {
    const beforeScoring = JSON.stringify(SCORING_CONFIG);
    const beforeTourney = JSON.stringify(TOURNAMENT_CONFIG);
    resolveCandidates(allCandidateNames());
    expect(JSON.stringify(SCORING_CONFIG)).toBe(beforeScoring);
    expect(JSON.stringify(TOURNAMENT_CONFIG)).toBe(beforeTourney);
    // and the canonical defaults are exactly what we expect
    expect(TOURNAMENT_CONFIG.HEIGHT_PER_INCH).toBe(0.15);
    expect(TOURNAMENT_CONFIG.HEIGHT_CAP).toBe(3.0);
  });

  it("throws on an unknown candidate name", () => {
    expect(() => resolveCandidates(["no-such-config"])).toThrow(/unknown candidate/);
  });
});
