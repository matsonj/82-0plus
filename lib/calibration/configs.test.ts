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
      "pace-adj",
      "gamescore-rebalanced",
      "height-trim",
      "seed-oversize",
      "height-aware-combined",
      "height-aware-v2",
      "oversize-off",
      "oversize-count-1",
      "oversize-count-2",
      "oversize-count-soft",
      "oversize-count-hard",
      "spacing-era-aware",
      "size-and-spacing",
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
    expect(r.scoring.NET_PER_GQ).toBe(40);
    // an un-overridden tournament knob keeps its (live) default
    expect(r.tournament.HOME_BUFF).toBe(TOURNAMENT_CONFIG.HOME_BUFF);
    // an un-overridden scoring knob keeps its (live) default
    expect(r.scoring.GAMES).toBe(SCORING_CONFIG.GAMES);
  });

  it("current candidate equals the live defaults", () => {
    const r = resolveCandidate(CANDIDATES.find((c) => c.name === "current")!);
    expect(r.scoring).toEqual(SCORING_CONFIG);
    expect(r.tournament).toEqual(TOURNAMENT_CONFIG);
  });

  it("registers the era-aware spacing candidates with boolean overrides widened", () => {
    const spacing = resolveCandidate(
      CANDIDATES.find((c) => c.name === "spacing-era-aware")!,
    );
    expect(spacing.scoring.SPACING_REQUIRE_VOLUME).toBe(true);
    expect(spacing.scoring.OUTSIDE_PEN_2).toBe(9);
    expect(spacing.scoring.OUTSIDE_PEN_3PLUS).toBe(26);

    const bundled = resolveCandidate(
      CANDIDATES.find((c) => c.name === "size-and-spacing")!,
    );
    expect(bundled.scoring.SPACING_REQUIRE_VOLUME).toBe(true);
    expect(bundled.scoring.OVERSIZE_PER_TALL).toBe(
      SCORING_CONFIG.OVERSIZE_PER_TALL,
    );
    expect(bundled.scoring.OVERSIZE_MAX_PEN).toBe(
      SCORING_CONFIG.OVERSIZE_MAX_PEN,
    );
    expect(bundled.scoring.OUTSIDE_PEN_2).toBe(2);
    expect(bundled.scoring.OUTSIDE_PEN_3PLUS).toBe(4);
  });

  it("anchors height-aware lever candidates to the pre-height-aware baseline", () => {
    const byName = (name: string) =>
      resolveCandidate(CANDIDATES.find((c) => c.name === name)!);

    const paceAdj = byName("pace-adj");
    expect(paceAdj.scoring.OVERSIZE_MAX_PEN).toBe(0);
    expect(paceAdj.scoring.SPACING_REQUIRE_VOLUME).toBe(false);
    expect(paceAdj.tournament.HEIGHT_PER_INCH).toBe(0.06);
    expect(paceAdj.tournament.HEIGHT_CAP).toBe(1.25);
    expect(paceAdj.tournament.GAMESCORE_CATEGORIES).toBe("legacy");
    expect(paceAdj.tournament.PACE_ADJUST_GAMESCORE).toBe(true);

    const rebalanced = byName("gamescore-rebalanced");
    expect(rebalanced.scoring.OVERSIZE_MAX_PEN).toBe(0);
    expect(rebalanced.scoring.SPACING_REQUIRE_VOLUME).toBe(false);
    expect(rebalanced.tournament.HEIGHT_PER_INCH).toBe(0.06);
    expect(rebalanced.tournament.HEIGHT_CAP).toBe(1.25);
    expect(rebalanced.tournament.GAMESCORE_CATEGORIES).toBe("rebalanced");
    expect(rebalanced.tournament.PACE_ADJUST_GAMESCORE).toBe(false);

    const seedOversize = byName("seed-oversize");
    expect(seedOversize.scoring.OVERSIZE_MAX_PEN).toBe(6);
    expect(seedOversize.scoring.SPACING_REQUIRE_VOLUME).toBe(false);
    expect(seedOversize.tournament.HEIGHT_PER_INCH).toBe(0.06);
    expect(seedOversize.tournament.HEIGHT_CAP).toBe(1.25);
    expect(seedOversize.tournament.GAMESCORE_CATEGORIES).toBe("legacy");
    expect(seedOversize.tournament.PACE_ADJUST_GAMESCORE).toBe(false);
  });

  it("leaves the live default objects unmutated after resolving every candidate", () => {
    const beforeScoring = JSON.stringify(SCORING_CONFIG);
    const beforeTourney = JSON.stringify(TOURNAMENT_CONFIG);
    resolveCandidates(allCandidateNames());
    expect(JSON.stringify(SCORING_CONFIG)).toBe(beforeScoring);
    expect(JSON.stringify(TOURNAMENT_CONFIG)).toBe(beforeTourney);
    // and the canonical (adopted height-aware) defaults are exactly what we expect
    expect(TOURNAMENT_CONFIG.HEIGHT_PER_INCH).toBe(0.045);
    expect(TOURNAMENT_CONFIG.HEIGHT_CAP).toBe(0.9);
    expect(SCORING_CONFIG.SPACING_REQUIRE_VOLUME).toBe(true);
    expect(SCORING_CONFIG.SPACING_ERA_SEASON).toBe(1979);
    expect(SCORING_CONFIG.NET_PER_GQ).toBe(42.5);
    expect(SCORING_CONFIG.OUTSIDE_PEN_2).toBe(2);
    expect(SCORING_CONFIG.OUTSIDE_PEN_3PLUS).toBe(4);
  });

  it("throws on an unknown candidate name", () => {
    expect(() => resolveCandidates(["no-such-config"])).toThrow(/unknown candidate/);
  });
});
