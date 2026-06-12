// ============================================================================
// Report rendering — Markdown (human) + JSON (machine).
//
// The Markdown report leads with a candidate ranking, then a per-candidate
// breakdown of all three targets plus the guardrails, top player-seasons and
// top pairs. metrics.json is just the structured CalibrationReport.
// ============================================================================

import type {
  BucketRate,
  CalibrationMetrics,
  CalibrationReport,
  DistStats,
  GuardrailResult,
} from "./types";

function table(headers: string[], rows: (string | number)[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return [head, sep, body].join("\n");
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const dist = (d: DistStats) =>
  `mean ${d.mean}, median ${d.median}, p10 ${d.p10}, p90 ${d.p90}, σ ${d.std} (n=${d.count})`;

function guardrailRows(gs: GuardrailResult[]): (string | number)[][] {
  return gs.map((g) => [
    g.passed ? "✅" : "⚠️",
    g.label,
    g.value,
    g.threshold,
    g.penalty,
    g.note,
  ]);
}

function bucketTable(title: string, buckets: BucketRate[]): string {
  return (
    `**${title}**\n\n` +
    table(
      ["bucket", "games", "rate"],
      buckets.map((b) => [b.bucket, b.count, pct(b.rate)]),
    )
  );
}

function candidateSection(m: CalibrationMetrics): string {
  const lines: string[] = [];
  lines.push(`## ${m.candidate} — score ${m.score}`);
  lines.push("");
  lines.push(`_${m.description}_`);
  lines.push("");
  lines.push(
    `Sub-scores — team rating: **${m.subScores.teamRating}**, tournament: **${m.subScores.tournament}**, game W/L: **${m.subScores.game}** (equal weight).`,
  );
  lines.push("");

  lines.push("### Guardrails");
  lines.push("");
  lines.push(
    table(
      ["", "guardrail", "value", "threshold", "penalty", "note"],
      guardrailRows(m.guardrails),
    ),
  );
  lines.push("");

  // Team rating.
  const tr = m.teamRating;
  lines.push("### Team rating (regular season)");
  lines.push("");
  lines.push(`- Teams rated: ${tr.teamCount}`);
  lines.push(`- Projected wins: ${dist(tr.wins)}`);
  lines.push(`- Net rating: ${dist(tr.net)}`);
  lines.push("");
  lines.push("Predictor correlations with net rating (|corr| desc):");
  lines.push("");
  lines.push(
    table(
      ["predictor", "corr"],
      tr.correlations.map((c) => [c.predictor, c.corr]),
    ),
  );
  lines.push("");
  if (tr.archetypeDeltas.length) {
    lines.push("Synthetic archetype rating (meanNet desc):");
    lines.push("");
    lines.push(
      table(
        ["archetype", "n", "meanNet", "meanWins", "meanSeedNet"],
        tr.archetypeDeltas.map((a) => [
          a.archetype,
          a.count,
          a.meanNet,
          a.meanWins,
          a.meanSeedNet,
        ]),
      ),
    );
    lines.push("");
  }

  // Tournament.
  const t = m.tournament;
  lines.push("### Tournament conversion");
  lines.push("");
  lines.push(`- Fields replayed: ${t.fieldsReplayed}`);
  lines.push(`- Mean reached round: ${t.reachedRoundMean}`);
  lines.push(`- Tall-stack champion share: ${pct(t.tallStackChampShare)} (fair ≈ 25%)`);
  lines.push("");
  if (t.archetypeConversion.length) {
    lines.push("Archetype conversion (champion rate desc):");
    lines.push("");
    lines.push(
      table(
        ["archetype", "n", "champ%", "final%", "meanRound"],
        t.archetypeConversion.map((a) => [
          a.archetype,
          a.count,
          pct(a.champRate),
          pct(a.finalRate),
          a.meanReachedRound,
        ]),
      ),
    );
    lines.push("");
  }
  lines.push(bucketTable("Champion rate by team-height bucket", t.championRateByHeightBucket));
  lines.push("");

  // Game W/L.
  const g = m.game;
  lines.push("### Per-game W/L behavior");
  lines.push("");
  lines.push(`- Games: ${g.games}`);
  lines.push(`- Home win rate: ${pct(g.homeWinRate)}`);
  lines.push("");
  lines.push(bucketTable("Higher-seed win rate by seedNet diff", g.winRateBySeedNetDiff));
  lines.push("");
  lines.push(bucketTable("Taller-team win rate by height edge", g.winRateByHeightDiff));
  lines.push("");
  lines.push(bucketTable("Game-score winner rate by game-score diff", g.winRateByGameScoreDiff));
  lines.push("");
  lines.push("**Modifier decisive rate** (winner flips if zeroed):");
  lines.push("");
  lines.push(
    table(
      ["modifier", "games", "rate"],
      g.modifierDecisiveRates.map((d) => [d.modifier, d.decisiveGames, pct(d.rate)]),
    ),
  );
  lines.push("");

  // Players + pairs.
  if (m.topPlayers.length) {
    lines.push("### Top player-seasons (by championships)");
    lines.push("");
    lines.push(
      table(
        ["player", "appearances", "champs", "finals"],
        m.topPlayers.map((p) => [
          p.name,
          p.appearances,
          p.championAppearances,
          p.deepRunAppearances,
        ]),
      ),
    );
    lines.push("");
  }
  if (m.topPairs.length) {
    lines.push("### Top pairs (by finals appearances)");
    lines.push("");
    lines.push(
      table(
        ["pair", "finals"],
        m.topPairs.map((p) => [p.names, p.deepRunCount]),
      ),
    );
    lines.push("");
  }

  return lines.join("\n");
}

export function renderMarkdown(report: CalibrationReport): string {
  const lines: string[] = [];
  lines.push("# Tournament Calibration Report");
  lines.push("");
  lines.push(`- Run: \`${report.runId}\``);
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(
    `- Fields: ${report.historicalFields} historical + ${report.syntheticFields} synthetic`,
  );
  lines.push(
    `- Options: sample=${report.options.sampleSize}, synthetic=${report.options.syntheticCount}, seed=${report.options.seed}, modes=[${report.options.modes.join(", ")}]`,
  );
  lines.push("");

  lines.push("## Ranking");
  lines.push("");
  const ranked = [...report.candidates].sort((a, b) => b.score - a.score);
  lines.push(
    table(
      ["rank", "candidate", "score", "team", "tourney", "game", "guardrails"],
      ranked.map((m, i) => [
        i + 1,
        m.candidate,
        m.score,
        m.subScores.teamRating,
        m.subScores.tournament,
        m.subScores.game,
        `${m.guardrails.filter((x) => x.passed).length}/${m.guardrails.length}`,
      ]),
    ),
  );
  lines.push("");
  lines.push(
    "> Score is an equal-weight blend of the three targets minus guardrail penalties — a ranking aid. Read the per-candidate breakdown below for the real signal.",
  );
  lines.push("");

  for (const m of ranked) {
    lines.push(candidateSection(m));
    lines.push("");
  }

  return lines.join("\n");
}

export function renderJson(report: CalibrationReport): string {
  return JSON.stringify(report, null, 2);
}
