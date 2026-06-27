import { describe, it, expect } from "vitest";
import { fixturePlayerPool, fixtureStatNorms } from "./fixture";
import { buildSyntheticFields } from "./synthetic";
import { CANDIDATES, resolveCandidate, resolveCandidates } from "./configs";
import { replayCandidate } from "./extract";
import { runCalibration } from "./run";
import { renderMarkdown, renderJson } from "./report";
import type { CalibrationRunOptions } from "./types";

const pool = fixturePlayerPool();
const norms = fixtureStatNorms(pool);
const current = resolveCandidate(CANDIDATES[0]); // "current"

describe("synthetic field generation", () => {
  it("builds deterministic, valid-size fields from the fixture pool", () => {
    const a = buildSyntheticFields(pool, 3, "seed");
    const b = buildSyntheticFields(pool, 3, "seed");
    expect(a.length).toBe(3);
    // deterministic: same seed → identical team ids in identical order
    expect(a.map((f) => f.teams.map((t) => t.team.id))).toEqual(
      b.map((f) => f.teams.map((t) => t.team.id)),
    );
    // every team carries an archetype label and the field is a valid bracket size
    for (const f of a) {
      expect([4, 8, 12, 16, 20]).toContain(f.size);
      expect(f.teams).toHaveLength(f.size);
      for (const ref of f.teams) expect(ref.archetype).toBeTruthy();
    }
  });
});

describe("replay + metric extraction", () => {
  const fields = buildSyntheticFields(pool, 2, "test");

  it("generated fields to replay", () => {
    expect(fields.length).toBe(2);
  });

  it("crowns exactly one champion per field and aggregates players/pairs/games", () => {
    const obs = replayCandidate(current, fields, norms);
    expect(obs.fieldsReplayed).toBe(fields.length);

    // one champion per replayed field
    const champs = obs.tournamentRows.filter((r) => r.isChampion);
    expect(champs.length).toBe(fields.length);

    // per-game W/L rows extracted with a flip-mod array
    expect(obs.gameRows.length).toBeGreaterThan(0);
    for (const g of obs.gameRows) expect(Array.isArray(g.flipMods)).toBe(true);

    // player + pair aggregation populated
    expect(obs.players.size).toBeGreaterThan(0);
    expect(obs.pairs.size).toBeGreaterThan(0);
    expect([...obs.players.values()].every((p) => p.appearances > 0)).toBe(true);

    // a team is rated once per unique id
    expect(obs.teamRatingRows.length).toBeGreaterThan(0);
  });

  it("different scoring overrides change team ratings", () => {
    const legacy = resolveCandidate(
      CANDIDATES.find((c) => c.name === "legacy-pre-calibration")!,
    );
    const a = replayCandidate(current, fields, norms);
    const b = replayCandidate(legacy, fields, norms);
    const netA = a.teamRatingRows.map((r) => r.netRating);
    const netB = b.teamRatingRows.map((r) => r.netRating);
    // same set of teams, but the overrides shift at least one net rating
    expect(netA).not.toEqual(netB);
  });
});

describe("runCalibration + report rendering (fixture smoke)", () => {
  const fields = buildSyntheticFields(pool, 4, "smoke");
  const options: CalibrationRunOptions = {
    sampleSize: 0,
    syntheticCount: 4,
    seed: "smoke",
    modes: ["classic"],
    outDir: "/tmp/ignored",
    candidates: ["current", "legacy-pre-calibration"],
  };

  it("produces a scored report for each candidate", () => {
    const report = runCalibration({
      options,
      candidates: resolveCandidates(options.candidates),
      historicalFields: [],
      syntheticFields: fields,
      norms,
      runId: "test-run",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(report.candidates).toHaveLength(2);
    for (const c of report.candidates) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(1);
      expect(c.guardrails.length).toBe(5);
      expect(c.tournament.fieldsReplayed).toBe(fields.length);
    }
  });

  it("renders non-empty Markdown and valid JSON", () => {
    const report = runCalibration({
      options,
      candidates: resolveCandidates(options.candidates),
      historicalFields: [],
      syntheticFields: fields,
      norms,
      runId: "test-run",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const md = renderMarkdown(report);
    expect(md).toContain("# Tournament Calibration Report");
    expect(md).toContain("## Ranking");
    expect(md).toContain("### Guardrails");
    expect(md).toContain("### Per-game W/L behavior");

    const parsed = JSON.parse(renderJson(report));
    expect(parsed.candidates).toHaveLength(2);
    expect(parsed.runId).toBe("test-run");
  });
});
