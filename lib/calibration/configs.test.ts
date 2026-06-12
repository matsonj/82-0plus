import { describe, it, expect } from "vitest";
import { CANDIDATES, resolveCandidate, resolveCandidates, allCandidateNames } from "./configs";
import { SCORING_CONFIG } from "../scoring";
import { TOURNAMENT_CONFIG } from "../tournament";

describe("candidate configs", () => {
  it("registers the post-adoption candidate set (live baseline + revert + stress tests)", () => {
    expect(allCandidateNames()).toEqual([
      "current",
      "legacy-pre-calibration",
      "height-edge-min",
      "combined-max-floor",
    ]);
  });

  it("merges overrides onto the live defaults", () => {
    const r = resolveCandidate(
      CANDIDATES.find((c) => c.name === "legacy-pre-calibration")!,
    );
    // the revert restores the pre-calibration height + size constants
    expect(r.tournament.HEIGHT_PER_INCH).toBe(0.15);
    expect(r.tournament.HEIGHT_CAP).toBe(3.0);
    expect(r.scoring.SIZE_MAX_PEN).toBe(6);
    // an un-overridden tournament knob keeps its (live) default
    expect(r.tournament.HOME_BUFF).toBe(TOURNAMENT_CONFIG.HOME_BUFF);
    // an un-overridden scoring knob keeps its (live) default
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
    // and the canonical (adopted combined-max) defaults are exactly what we expect
    expect(TOURNAMENT_CONFIG.HEIGHT_PER_INCH).toBe(0.06);
    expect(TOURNAMENT_CONFIG.HEIGHT_CAP).toBe(1.25);
  });

  it("throws on an unknown candidate name", () => {
    expect(() => resolveCandidates(["no-such-config"])).toThrow(/unknown candidate/);
  });
});
