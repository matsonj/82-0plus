/**
 * tuneTournament.ts — a read-only tuning harness for the Tournament Edition
 * engine. Builds a 16-team field from the seeded ghosts, runs N brackets through
 * `simulateBracket`, prints a per-team breakdown row for every game, and prints
 * aggregate sanity stats (margins, series-length distribution, upset rate by
 * seed gap, and how often each modifier was DECISIVE). This is the signal you
 * use to tune the TOURNAMENT_CONFIG knobs in lib/tournament.ts.
 *
 * One-off local dev script. It WRITES NOTHING — it only reads (stat norms +
 * ghost re-hydration go through the read pool).
 *
 * HOW TO RUN:
 *   MOTHERDUCK_TOKEN=<read token> \
 *   MOTHERDUCK_RW_TOKEN=<read-write token> \
 *     npx tsx scripts/tuneTournament.ts [N] [seedKey]
 *
 *   - MOTHERDUCK_TOKEN     (read)  — stat norms + roster hydration.
 *   - MOTHERDUCK_RW_TOKEN  (write-token, used READ-ONLY here) — drawOpponents
 *       SELECTs the ghosts table through the RW pool (queryRW). No writes occur.
 *   - The ghosts table must already be populated: run `npx tsx scripts/seedGhosts.ts` first.
 *
 *   - N        optional, default 1   — number of brackets to simulate.
 *   - seedKey  optional, default "tune" — base bracket seed; bracket i uses `${seedKey}-${i}`.
 */

import { drawOpponents, getStatNorms } from "../lib/tournamentQueries";
import {
  TOURNAMENT_CONFIG,
  simulateBracket,
  type TournamentTeam,
} from "../lib/tournament";
import type {
  BracketResult,
  BracketTeam,
  GameBreakdown,
  SeriesResult,
} from "../lib/types";

// ── CLI args ─────────────────────────────────────────────────────────────────
const N = (() => {
  const v = Number(process.argv[2]);
  return Number.isInteger(v) && v > 0 ? v : 1;
})();
const BASE_SEED = process.argv[3] ?? "tune";

// The buff fields we treat as decisive-candidates. fatigue & recoveryCarry are
// SUBTRACTED in the engine's adj formula; the others are ADDED. randomFactor is
// signed. We re-derive adj with each one zeroed to test if the winner flips.
const ADD_MODS = [
  "gameScoreBuff",
  "heightBuff",
  "homeBuff",
  "randomFactor",
] as const;
const SUB_MODS = ["fatigue", "recoveryCarry"] as const;
type ModKey = (typeof ADD_MODS)[number] | (typeof SUB_MODS)[number];
const ALL_MODS: ModKey[] = [...ADD_MODS, ...SUB_MODS];

// ── helpers ──────────────────────────────────────────────────────────────────
const ROUND_NAME: Record<number, string> = {
  0: "R1", // rounds[0]
  1: "Semis",
  2: "ConfFin",
  3: "Final",
};

const fmt = (x: number, w = 6, d = 2) => x.toFixed(d).padStart(w, " ");

/** Recompute a team's adjusted net from its breakdown (mirrors the engine). */
function adjFrom(b: GameBreakdown): number {
  return (
    b.seedNet +
    b.gameScoreBuff +
    b.heightBuff +
    b.homeBuff -
    b.fatigue -
    b.recoveryCarry +
    b.randomFactor
  );
}

/** Adjusted net for a team with ONE modifier zeroed out. */
function adjWithModZeroed(b: GameBreakdown, mod: ModKey): number {
  return adjFrom({ ...b, [mod]: 0 });
}

async function main(): Promise<void> {
  console.log(`[tune] building a 16-team ghost field via drawOpponents…`);
  // "__none__" never matches a real submission name_norm, so the field is topped
  // up entirely from the ghosts table (run seedGhosts.ts first). seedNet 8 picks
  // a representative tier; the any-ghost fallback guarantees a full 16 regardless.
  const drawn = await drawOpponents("__none__", "classic", 8, {}, 16);
  console.log(`[tune] drawOpponents returned ${drawn.length} teams.`);
  if (drawn.length < 16) {
    throw new Error(
      `need 16 teams; drawOpponents returned ${drawn.length}. ` +
        `Did you run scripts/seedGhosts.ts to populate the ghosts table?`,
    );
  }
  const field: TournamentTeam[] = drawn.slice(0, 16);

  console.log(`[tune] loading stat norms…`);
  const norms = await getStatNorms();

  console.log(
    `[tune] running ${N} bracket(s) with config:`,
    JSON.stringify(TOURNAMENT_CONFIG),
  );

  // ── aggregates across all brackets ──
  let totalGames = 0;
  let marginSum = 0; // sum of |margin|
  const seriesLengths: Record<string, number> = {}; // "3-0" → count
  // upsets keyed by seed gap (loSeed - hiSeed within the matchup framing).
  const seriesBySeedGap: Record<number, { total: number; upsets: number }> = {};
  // how often zeroing a single modifier would flip the game winner.
  const decisive: Record<ModKey, number> = Object.fromEntries(
    ALL_MODS.map((m) => [m, 0]),
  ) as Record<ModKey, number>;

  for (let i = 0; i < N; i++) {
    const seedKey = N === 1 ? BASE_SEED : `${BASE_SEED}-${i}`;
    const bracket: BracketResult = simulateBracket(field, seedKey, norms);

    // teamId → identity (seed/conf/name) for labeling + upset detection.
    const teamById = new Map<string, BracketTeam>(
      bracket.teams.map((t) => [t.id, t]),
    );

    if (i === 0 || N <= 3) {
      printBracketTables(bracket, teamById, seedKey);
    }

    // ── walk every series/game for the aggregates ──
    bracket.rounds.forEach((round) => {
      round.forEach((series) => {
        accumulateSeries(series, {
          onGame: (g, winnerFlipMods) => {
            totalGames++;
            marginSum += Math.abs(g.margin);
            for (const m of winnerFlipMods) decisive[m]++;
          },
        });

        // series length distribution
        const label = `${Math.max(series.scoreHi, series.scoreLo)}-${Math.min(
          series.scoreHi,
          series.scoreLo,
        )}`;
        seriesLengths[label] = (seriesLengths[label] ?? 0) + 1;

        // upset by seed gap: the LOWER seed (numerically larger) winning is an upset.
        const hi = teamById.get(series.hiId);
        const lo = teamById.get(series.loId);
        if (hi && lo) {
          const gap = Math.abs(lo.seed - hi.seed);
          const bucket =
            (seriesBySeedGap[gap] ??= { total: 0, upsets: 0 });
          bucket.total++;
          // hiId is the higher seed (better seedNet). If the loId team won → upset.
          if (series.winnerId === series.loId) bucket.upsets++;
        }
      });
    });

    console.log(
      `[tune] bracket "${seedKey}" champion: ${bracket.championName} (${bracket.championId})`,
    );
  }

  printAggregates({
    totalGames,
    marginSum,
    seriesLengths,
    seriesBySeedGap,
    decisive,
    brackets: N,
  });
}

/**
 * Walk a series' games. For each game, determine which single modifier, if
 * zeroed for BOTH teams, would flip the winner — that modifier was "decisive"
 * for that game.
 */
function accumulateSeries(
  series: SeriesResult,
  cb: { onGame: (g: SeriesResult["games"][number], flipMods: ModKey[]) => void },
): void {
  for (const g of series.games) {
    const homeBd = g.breakdown?.[g.homeId];
    const awayBd = g.breakdown?.[g.awayId];
    const flipMods: ModKey[] = [];
    if (homeBd && awayBd) {
      const baseHome = adjFrom(homeBd);
      const baseAway = adjFrom(awayBd);
      const baseWinner = baseHome >= baseAway ? g.homeId : g.awayId;
      for (const m of ALL_MODS) {
        const h = adjWithModZeroed(homeBd, m);
        const a = adjWithModZeroed(awayBd, m);
        const w = h >= a ? g.homeId : g.awayId;
        if (w !== baseWinner) flipMods.push(m);
      }
    }
    cb.onGame(g, flipMods);
  }
}

/** Print one readable table PER TEAM for every game in the bracket. */
function printBracketTables(
  bracket: BracketResult,
  teamById: Map<string, BracketTeam>,
  seedKey: string,
): void {
  console.log(`\n========== BRACKET "${seedKey}" — per-game breakdown ==========`);

  type Row = {
    round: string;
    series: string;
    game: number;
    team: string;
    seed: number;
    seedNet: string;
    gameScore: string;
    height: string;
    home: string;
    fatigue: string;
    recovery: string;
    random: string;
    adj: string;
    win: string;
  };

  const rows: Row[] = [];

  bracket.rounds.forEach((round, roundIdx) => {
    round.forEach((series, sIdx) => {
      const hi = teamById.get(series.hiId);
      const lo = teamById.get(series.loId);
      const seriesLabel = `${hi?.name ?? series.hiId}(${hi?.seed ?? "?"}) vs ${
        lo?.name ?? series.loId
      }(${lo?.seed ?? "?"})`;

      series.games.forEach((g) => {
        for (const teamId of [g.homeId, g.awayId]) {
          const bd = g.breakdown?.[teamId];
          if (!bd) continue;
          const ident = teamById.get(teamId);
          rows.push({
            round: ROUND_NAME[roundIdx] ?? `R${roundIdx + 1}`,
            series: `s${sIdx}`,
            game: g.gameNo,
            team: `${ident?.name ?? teamId}${teamId === g.homeId ? " (H)" : " (A)"}`,
            seed: ident?.seed ?? 0,
            seedNet: fmt(bd.seedNet),
            gameScore: fmt(bd.gameScoreBuff),
            height: fmt(bd.heightBuff),
            home: fmt(bd.homeBuff),
            fatigue: fmt(bd.fatigue),
            recovery: fmt(bd.recoveryCarry),
            random: fmt(bd.randomFactor),
            adj: fmt(bd.adj),
            win: teamId === g.winnerId ? "W" : "",
          });
        }
      });

      // Series header line, then the per-team game rows belonging to it.
      console.log(
        `\n[${ROUND_NAME[roundIdx] ?? `R${roundIdx + 1}`} s${sIdx}] ${seriesLabel} ` +
          `→ ${teamById.get(series.winnerId)?.name ?? series.winnerId} ` +
          `wins ${Math.max(series.scoreHi, series.scoreLo)}-${Math.min(
            series.scoreHi,
            series.scoreLo,
          )} (best of ${series.bestOf})`,
      );
    });
  });

  // One big aligned table for all games (console.table gives aligned columns).
  console.table(rows);
}

/** Print the aggregate sanity stats used for tuning. */
function printAggregates(args: {
  totalGames: number;
  marginSum: number;
  seriesLengths: Record<string, number>;
  seriesBySeedGap: Record<number, { total: number; upsets: number }>;
  decisive: Record<ModKey, number>;
  brackets: number;
}): void {
  const { totalGames, marginSum, seriesLengths, seriesBySeedGap, decisive, brackets } =
    args;

  console.log(`\n========== AGGREGATE SANITY STATS (${brackets} bracket(s)) ==========`);
  console.log(`total games: ${totalGames}`);
  console.log(
    `avg |game margin|: ${
      totalGames > 0 ? (marginSum / totalGames).toFixed(2) : "n/a"
    }`,
  );

  // Series-length distribution.
  console.log(`\nseries-length distribution (winner-loser games):`);
  const lenRows = Object.entries(seriesLengths)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([label, count]) => ({
      result: label,
      count,
      pct: `${((100 * count) / sum(Object.values(seriesLengths))).toFixed(1)}%`,
    }));
  console.table(lenRows);

  // Upset rate by seed gap.
  console.log(`\nupset rate by seed gap (lower seed beating higher seed):`);
  const upsetRows = Object.keys(seriesBySeedGap)
    .map(Number)
    .sort((a, b) => a - b)
    .map((gap) => {
      const { total, upsets } = seriesBySeedGap[gap];
      return {
        seedGap: gap,
        series: total,
        upsets,
        upsetRate: `${total > 0 ? ((100 * upsets) / total).toFixed(1) : "0.0"}%`,
      };
    });
  console.table(upsetRows);

  // Decisive-modifier frequency.
  console.log(
    `\ndecisive-modifier frequency (would the game winner FLIP if this single modifier were zeroed):`,
  );
  const decRows = ALL_MODS.map((m) => ({
    modifier: m,
    decisiveGames: decisive[m],
    pctOfGames: `${
      totalGames > 0 ? ((100 * decisive[m]) / totalGames).toFixed(1) : "0.0"
    }%`,
  }));
  console.table(decRows);
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[tune] FAILED:", err);
    process.exit(1);
  });
