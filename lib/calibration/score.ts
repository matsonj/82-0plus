// ============================================================================
// Aggregation + scoring + guardrails.
//
// Turns one candidate's flat observation rows (extract.ts) into the structured
// CalibrationMetrics: distributions, factor correlations, archetype deltas,
// tournament conversion, per-game W/L buckets, an equal-weight score across the
// three targets, and the realism guardrails.
//
// The score is a RANKING AID, not ground truth — every input is reported so a
// human can audit why a candidate ranked where it did. Weights are equal across
// the three targets, per the spec.
// ============================================================================

import type {
  CalibrationMetrics,
  DistStats,
  Correlation,
  ArchetypeRating,
  ArchetypeTournament,
  BucketRate,
  GuardrailResult,
  PlayerAgg,
  PairAgg,
  TeamRatingMetrics,
  TournamentMetrics,
  GameMetrics,
  ResolvedCandidate,
} from "./types";
import type { CandidateObservations, TeamRatingRow } from "./extract";
import { DECISIVE_MODIFIERS } from "./extract";
import { TALL_STACK_ARCHETYPES } from "./synthetic";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (x: number, d = 3) => {
  const f = 10 ** d;
  return Math.round(x * f) / f;
};

function distStats(xs: number[]): DistStats {
  if (xs.length === 0) {
    return { count: 0, mean: 0, median: 0, p10: 0, p90: 0, min: 0, max: 0, std: 0 };
  }
  const s = [...xs].sort((a, b) => a - b);
  const pct = (p: number) => {
    const idx = (s.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return s[lo] + (s[hi] - s[lo]) * (idx - lo);
  };
  const m = mean(xs);
  const variance = mean(xs.map((x) => (x - m) ** 2));
  return {
    count: xs.length,
    mean: round(m, 2),
    median: round(pct(0.5), 2),
    p10: round(pct(0.1), 2),
    p90: round(pct(0.9), 2),
    min: round(s[0], 2),
    max: round(s[s.length - 1], 2),
    std: round(Math.sqrt(variance), 2),
  };
}

/** Pearson correlation; 0 if either series has no variance. */
function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

// ── bucketing ─────────────────────────────────────────────────────────────────

interface BucketEdge {
  label: string;
  max: number; // upper bound (exclusive); Infinity for the last
}

function bucketRates(
  rows: { value: number; hit: boolean | null }[],
  edges: BucketEdge[],
): BucketRate[] {
  return edges.map((e, i) => {
    const lo = i === 0 ? -Infinity : edges[i - 1].max;
    // `hit === null` means "no edge" (a tie) — excluded so it's neither a win
    // nor a loss for the higher-value team.
    const inB = rows.filter((r) => r.value >= lo && r.value < e.max && r.hit !== null);
    return {
      bucket: e.label,
      count: inB.length,
      rate: round(inB.length ? mean(inB.map((r) => (r.hit ? 1 : 0))) : 0),
    };
  });
}

const SEEDNET_EDGES: BucketEdge[] = [
  { label: "0–1", max: 1 },
  { label: "1–3", max: 3 },
  { label: "3–6", max: 6 },
  { label: "6–10", max: 10 },
  { label: "10+", max: Infinity },
];
const HEIGHT_EDGES: BucketEdge[] = [
  { label: "0–0.5", max: 0.5 },
  { label: "0.5–1.5", max: 1.5 },
  { label: "1.5–3", max: 3 },
  { label: "3+", max: Infinity },
];
const GAMESCORE_EDGES: BucketEdge[] = [
  { label: "0", max: 0.01 },
  { label: "0–2.25", max: 2.26 },
  { label: "2.25–3", max: 3.01 },
  { label: "3+", max: Infinity },
];
const TEAM_HEIGHT_EDGES: BucketEdge[] = [
  { label: "<78.0", max: 78 },
  { label: "78–79.5", max: 79.5 },
  { label: "79.5–81", max: 81 },
  { label: "81+", max: Infinity },
];

// ── target metric builders ─────────────────────────────────────────────────────

const TEAM_PREDICTORS: { key: string; get: (r: TeamRatingRow) => number }[] = [
  { key: "meanGQ (talent)", get: (r) => r.meanGQ },
  { key: "avgHeight", get: (r) => r.avgHeight },
  { key: "blocks", get: (r) => r.blocks },
  { key: "defBuff", get: (r) => r.defBuff },
];

function buildTeamRating(obs: CandidateObservations): TeamRatingMetrics {
  const rows = obs.teamRatingRows;
  const net = rows.map((r) => r.netRating);
  const correlations: Correlation[] = TEAM_PREDICTORS.map((p) => ({
    predictor: p.key,
    corr: round(pearson(rows.map(p.get), net)),
  })).sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));

  const byArch = new Map<string, TeamRatingRow[]>();
  for (const r of rows) {
    if (!r.archetype) continue;
    (byArch.get(r.archetype) ?? byArch.set(r.archetype, []).get(r.archetype)!).push(r);
  }
  const archetypeDeltas: ArchetypeRating[] = [...byArch.entries()]
    .map(([archetype, rs]) => ({
      archetype,
      count: rs.length,
      meanNet: round(mean(rs.map((r) => r.netRating)), 2),
      meanWins: round(mean(rs.map((r) => r.wins)), 1),
      meanSeedNet: round(mean(rs.map((r) => r.seedNet)), 2),
    }))
    .sort((a, b) => b.meanNet - a.meanNet);

  return {
    teamCount: rows.length,
    wins: distStats(rows.map((r) => r.wins)),
    net: distStats(net),
    correlations,
    archetypeDeltas,
  };
}

function buildTournament(obs: CandidateObservations): TournamentMetrics {
  const rows = obs.tournamentRows;
  const heightById = new Map(obs.teamRatingRows.map((r) => [r.id, r.avgHeight]));

  const byArch = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.source !== "synthetic" || !r.archetype) continue;
    (byArch.get(r.archetype) ?? byArch.set(r.archetype, []).get(r.archetype)!).push(r);
  }
  const archetypeConversion: ArchetypeTournament[] = [...byArch.entries()]
    .map(([archetype, rs]) => ({
      archetype,
      count: rs.length,
      champRate: round(mean(rs.map((r) => (r.isChampion ? 1 : 0)))),
      finalRate: round(mean(rs.map((r) => (r.isFinalist ? 1 : 0)))),
      meanReachedRound: round(mean(rs.map((r) => r.reachedRound)), 2),
    }))
    .sort((a, b) => b.champRate - a.champRate);

  const synthChamps = rows.filter((r) => r.source === "synthetic" && r.isChampion);
  const tallStackChampShare = round(
    synthChamps.length
      ? mean(
          synthChamps.map((r) =>
            r.archetype && TALL_STACK_ARCHETYPES.has(r.archetype) ? 1 : 0,
          ),
        )
      : 0,
  );

  const champHeightRows = rows.map((r) => ({
    value: heightById.get(r.id) ?? 0,
    hit: r.isChampion,
  }));
  const championRateByHeightBucket = bucketRates(champHeightRows, TEAM_HEIGHT_EDGES);

  // ── REAL-field tall-stack dominance (the previously-unmeasured failure mode) ──
  // Replayed HISTORICAL fields only — synthetic fields are balanced by construction
  // and don't reflect the tier-segmented, tall-skewed real pool. tallCount comes
  // from the team-rating rows (# of ≥83" starters).
  const tallById = new Map(obs.teamRatingRows.map((r) => [r.id, r.tallCount]));
  const hist = rows.filter((r) => r.source === "historical");
  const tcLabel = (tc: number) => (tc >= 3 ? "3+" : String(tc));
  const byTc = new Map<string, { n: number; champ: number }>();
  for (const lbl of ["0", "1", "2", "3+"]) byTc.set(lbl, { n: 0, champ: 0 });
  for (const r of hist) {
    const b = byTc.get(tcLabel(tallById.get(r.id) ?? 0))!;
    b.n++;
    if (r.isChampion) b.champ++;
  }
  const realChampRateByTallCount: BucketRate[] = [...byTc].map(([bucket, v]) => ({
    bucket,
    count: v.n,
    rate: round(v.n ? v.champ / v.n : 0),
  }));
  const overallRate = hist.length
    ? mean(hist.map((r) => (r.isChampion ? 1 : 0)))
    : 0;
  const tall = hist.filter((r) => (tallById.get(r.id) ?? 0) >= 3);
  const tallRate = tall.length
    ? mean(tall.map((r) => (r.isChampion ? 1 : 0)))
    : 0;
  // Need a real sample of 3+-tall teams AND a positive base rate to judge; else
  // 1 (height-neutral) so a synthetic-only / thin run never penalizes spuriously.
  const realTallChampLift =
    tall.length >= 10 && overallRate > 0 ? round(tallRate / overallRate, 2) : 1;

  return {
    fieldsReplayed: obs.fieldsReplayed,
    reachedRoundMean: round(mean(rows.map((r) => r.reachedRound)), 2),
    archetypeConversion,
    tallStackChampShare,
    championRateByHeightBucket,
    realChampRateByTallCount,
    realTallChampLift,
  };
}

function buildGame(obs: CandidateObservations): GameMetrics {
  const g = obs.gameRows;
  const decisive = DECISIVE_MODIFIERS.map((m) => {
    const n = g.filter((r) => r.flipMods.includes(m)).length;
    return { modifier: m, decisiveGames: n, rate: round(g.length ? n / g.length : 0) };
  });
  return {
    games: g.length,
    homeWinRate: round(g.length ? mean(g.map((r) => (r.homeWon ? 1 : 0))) : 0),
    winRateBySeedNetDiff: bucketRates(
      g.map((r) => ({ value: r.seedNetAbsDiff, hit: r.higherSeedWon })),
      SEEDNET_EDGES,
    ),
    winRateByHeightDiff: bucketRates(
      g.map((r) => ({ value: r.heightEdgeAbsDiff, hit: r.higherHeightWon })),
      HEIGHT_EDGES,
    ),
    winRateByGameScoreDiff: bucketRates(
      g.map((r) => ({ value: r.gameScoreAbsDiff, hit: r.higherGameScoreWon })),
      GAMESCORE_EDGES,
    ),
    modifierDecisiveRates: decisive,
  };
}

// ── scoring + guardrails ────────────────────────────────────────────────────

const corrOf = (cs: Correlation[], key: string) =>
  Math.abs(cs.find((c) => c.predictor === key)?.corr ?? 0);
const archNet = (tr: TeamRatingMetrics, label: string) =>
  tr.archetypeDeltas.find((a) => a.archetype === label)?.meanNet ?? 0;
const archWins = (tr: TeamRatingMetrics, label: string) =>
  tr.archetypeDeltas.find((a) => a.archetype === label)?.meanWins ?? 0;

// Tall stacks make up 4 of the 16-team synthetic composition → a fair champion
// share is ~0.25. Above that, they're over-rewarded; well below ~0.10, the model
// has over-corrected (true all-time bigs should still be excellent).
const FAIR_TALL_SHARE = 0.25;
const TALL_OVER_THRESHOLD = 0.45;
const TALL_FLOOR = 0.1;

// Real-field tall-stack champion lift (champ rate of 3+ ≥83" starters ÷ the field
// rate, on replayed HISTORICAL brackets). 1 ≈ height-neutral; the live engine sits
// near 3. Above this, height — not talent — is deciding the real bracket.
const REAL_TALL_LIFT_MAX = 2.0;

function buildGuardrails(
  tr: TeamRatingMetrics,
  t: TournamentMetrics,
): GuardrailResult[] {
  const out: GuardrailResult[] = [];

  // G1 — height/blocks must NOT out-predict talent for reg-season net rating.
  const talent = corrOf(tr.correlations, "meanGQ (talent)");
  const sizeCorr = Math.max(corrOf(tr.correlations, "avgHeight"), corrOf(tr.correlations, "blocks"));
  const g1v = round(sizeCorr - talent);
  out.push({
    key: "height-blocks-dominance",
    label: "Height/blocks not the dominant team-rating predictor",
    value: g1v,
    threshold: 0,
    penalty: round(clamp01(Math.max(0, g1v) / 0.3) * 0.3, 3),
    passed: g1v <= 0,
    note: `|corr(size,net)|=${round(sizeCorr)} vs |corr(talent,net)|=${round(talent)}`,
  });

  // G2 — frontcourt stacks must not dominate the tournament beyond their share.
  const g2v = t.tallStackChampShare;
  out.push({
    key: "frontcourt-stack-dominance",
    label: "Tall stacks don't dominate balanced/perimeter controls",
    value: g2v,
    threshold: TALL_OVER_THRESHOLD,
    penalty: round(clamp01(Math.max(0, g2v - TALL_OVER_THRESHOLD) / 0.4) * 0.4, 3),
    passed: g2v <= TALL_OVER_THRESHOLD,
    note: `tall-stack champion share ${g2v} (fair ≈ ${FAIR_TALL_SHARE})`,
  });

  // G3 — elite creators must not sit materially below comparable elite bigs.
  const bigNet = Math.max(archNet(tr, "frontcourt-stack"), archNet(tr, "no-guard-bigs"));
  const creatorNet = archNet(tr, "perimeter-creators");
  const g3v = round(bigNet - creatorNet);
  out.push({
    key: "creator-vs-big-gap",
    label: "Elite creators within reach of elite bigs (reg-season net)",
    value: g3v,
    threshold: 3,
    penalty: round(clamp01(Math.max(0, g3v - 3) / 10) * 0.3, 3),
    passed: g3v <= 3,
    note: `bigNet=${bigNet} − creatorNet=${creatorNet}`,
  });

  // G4 — realism floor: true all-time bigs must STILL be excellent (no over-correction).
  const bigWins = Math.max(archWins(tr, "frontcourt-stack"), archWins(tr, "no-guard-bigs"));
  const underShare = t.tallStackChampShare < TALL_FLOOR;
  const underWins = bigWins < 60;
  out.push({
    key: "big-realism-floor",
    label: "Elite bigs remain excellent (model not over-corrected)",
    value: round(t.tallStackChampShare),
    threshold: TALL_FLOOR,
    penalty: underShare || underWins ? 0.2 : 0,
    passed: !(underShare || underWins),
    note: `tall-stack champ share ${round(t.tallStackChampShare)}, big mean wins ${bigWins}`,
  });

  // G5 — REAL-field tall stacks must not run the bracket beyond the field. This is
  // the previously-unmeasured failure mode: tier-segmented replay of actual
  // submitted teams, where 3+ ≥83" lineups win at ~3× the field on the live engine.
  const g5v = t.realTallChampLift;
  out.push({
    key: "real-tall-dominance",
    label: "Tall stacks don't dominate the real (replayed) field",
    value: g5v,
    threshold: REAL_TALL_LIFT_MAX,
    penalty: round(clamp01(Math.max(0, g5v - REAL_TALL_LIFT_MAX) / 1.5) * 0.4, 3),
    passed: g5v <= REAL_TALL_LIFT_MAX,
    note: `3+ tall champ-rate lift ${g5v}× (height-neutral ≈ 1; live engine ≈ 3)`,
  });

  return out;
}

function subScores(
  tr: TeamRatingMetrics,
  t: TournamentMetrics,
  game: GameMetrics,
): { teamRating: number; tournament: number; game: number } {
  // Team rating: talent should out-predict size.
  const talent = corrOf(tr.correlations, "meanGQ (talent)");
  const sizeCorr = Math.max(corrOf(tr.correlations, "avgHeight"), corrOf(tr.correlations, "blocks"));
  const teamRating = round(clamp01(0.5 + (talent - sizeCorr) * 0.7));

  // Tournament: tall stacks should win ≈ their fair share, not run the table.
  const over = Math.max(0, t.tallStackChampShare - FAIR_TALL_SHARE);
  const under = Math.max(0, TALL_FLOOR - t.tallStackChampShare); // over-correction also bad
  const tournament = round(clamp01(1 - over / (1 - FAIR_TALL_SHARE) - under / TALL_FLOOR));

  // Game: seed (talent) should be the primary driver, height secondary.
  const seedWR = mean(
    game.winRateBySeedNetDiff.flatMap((b) => Array(b.count).fill(b.rate)),
  );
  const seedScore = clamp01(1 - Math.abs(seedWR - 0.68) / 0.32);
  const heightDecisive =
    game.modifierDecisiveRates.find((m) => m.modifier === "heightBuff")?.rate ?? 0;
  const heightScore = clamp01(1 - heightDecisive / 0.15);
  const gameScore = round(0.5 * seedScore + 0.5 * heightScore);

  return { teamRating, tournament, game: gameScore };
}

function topPlayers(obs: CandidateObservations, n = 15): PlayerAgg[] {
  return [...obs.players.values()]
    .sort(
      (a, b) =>
        b.championAppearances - a.championAppearances ||
        b.deepRunAppearances - a.deepRunAppearances ||
        b.appearances - a.appearances,
    )
    .slice(0, n);
}

function topPairs(obs: CandidateObservations, n = 15): PairAgg[] {
  return [...obs.pairs.values()]
    .filter((p) => p.appearances >= 2) // drop one-off combos so rates mean something
    .sort(
      (a, b) =>
        b.championAppearances - a.championAppearances ||
        b.deepRunAppearances - a.deepRunAppearances ||
        b.appearances - a.appearances,
    )
    .slice(0, n);
}

/** Build the full per-candidate metrics from raw observations. */
export function scoreCandidate(
  candidate: ResolvedCandidate,
  obs: CandidateObservations,
): CalibrationMetrics {
  const teamRating = buildTeamRating(obs);
  const tournament = buildTournament(obs);
  const game = buildGame(obs);
  const guardrails = buildGuardrails(teamRating, tournament);
  const subs = subScores(teamRating, tournament, game);

  const base = (subs.teamRating + subs.tournament + subs.game) / 3;
  const penalty = guardrails.reduce((s, g) => s + g.penalty, 0);
  const score = round(clamp01(base - penalty));

  return {
    candidate: candidate.name,
    description: candidate.description,
    score,
    subScores: subs,
    guardrails,
    teamRating,
    tournament,
    game,
    topPlayers: topPlayers(obs),
    topPairs: topPairs(obs),
  };
}
