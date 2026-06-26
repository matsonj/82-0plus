// Derives the SIMULATE reveal "script" — the viewer's round-by-round path
// through a stored bracket — from data we already have. PURE + client-safe
// (no React, no Node, no DB): given the resolved bracket and the viewer's
// identity, it walks the rounds the viewer played and lays out, in order, each
// matchup, each game (with the viewer's score / W-L), which games were
// elimination games, the per-round clinch, and how the run ended.
//
// The SimulateReveal component animates this; revealPath itself decides nothing
// about timing or presentation.

import type { BracketResult, TournamentYou } from "./types";
import { regWinsFromSeedNet } from "./tier";

export interface RevealTeam {
  id: string;
  name: string;
  seed: number;
  regW: number;
  regL: number;
  seedNet: number;
}

export interface RevealGame {
  gameNo: number; // 1-based within the series
  youScore: number;
  oppScore: number;
  won: boolean;
  // True when the opponent was at match point BEFORE this game — i.e. a loss
  // here ends the viewer's run. Drives the slower, tenser reveal pacing.
  isElimination: boolean;
}

export interface RevealRound {
  roundAbsIndex: number; // index within bracket.rounds (also the meter's "current" − 1)
  roundName: string; // "Round of 16" · "Conf Semis" · "Conf Finals" · "The Final"
  bestOf: number;
  you: RevealTeam;
  opp: RevealTeam;
  games: RevealGame[];
  youWonSeries: boolean;
  seriesW: number; // viewer's wins in the series
  seriesL: number; // opponent's wins in the series
  isLastRound: boolean; // the viewer's run ends here (win = champion, or loss)
}

export type RevealEnd =
  | { kind: "champion" }
  | {
      kind: "eliminated";
      finish: string; // placement, e.g. "Runner-Up" · "Top 4" · "Round 1 exit"
    };

export interface RevealScript {
  totalRounds: number; // bracket.rounds.length — the round-state meter denominator
  rounds: RevealRound[]; // the viewer's path, in play order (round 0 first)
  end: RevealEnd;
}

// Round name from its absolute position, counted back from the Final so it works
// across bracket sizes (16 → R16 / Conf Semis / Conf Finals / Final).
function roundName(absIndex: number, totalRounds: number): string {
  const fromEnd = totalRounds - 1 - absIndex;
  switch (fromEnd) {
    case 0:
      return "The Final";
    case 1:
      return "Conf Finals";
    case 2:
      return "Conf Semis";
    case 3:
      return "Round of 16";
    default:
      return `Round ${absIndex + 1}`;
  }
}

// Placement label for a non-champion finish. `lostRound` is the 0-based round
// index the viewer lost in; `size` is the bracket size (defaults to 16).
function placementLabel(lostRound: number, size: number): string {
  // Teams still alive entering the lost round = size / 2^lostRound. The viewer
  // finished within that group.
  const aliveEntering = Math.max(2, Math.round(size / 2 ** lostRound));
  if (lostRound === 0) return "Round 1 exit";
  if (aliveEntering <= 2) return "Runner-Up";
  return `Top ${aliveEntering}`;
}

function teamOf(
  bracket: BracketResult,
  id: string,
): RevealTeam {
  const t = bracket.teams.find((x) => x.id === id);
  const seedNet = t?.seedNet ?? 0;
  const regW = regWinsFromSeedNet(seedNet);
  return {
    id,
    name: t?.name ?? id,
    seed: t?.seed ?? 0,
    regW,
    regL: 82 - regW,
    seedNet,
  };
}

/**
 * Build the viewer's reveal path through a bracket. Returns the ordered rounds
 * the viewer played plus the end state. Safe on any bracket: if the viewer's id
 * isn't found in a round, the path simply stops there.
 */
export function buildRevealScript(
  bracket: BracketResult,
  you: TournamentYou,
): RevealScript {
  const totalRounds = bracket.rounds.length;
  const size = bracket.size ?? 16;
  const isChampion = bracket.championId === you.id;
  const rounds: RevealRound[] = [];

  for (let ai = 0; ai < bracket.rounds.length; ai++) {
    const series = bracket.rounds[ai].find(
      (s) => s.hiId === you.id || s.loId === you.id,
    );
    if (!series) break;

    const oppId = series.hiId === you.id ? series.loId : series.hiId;
    const winsNeeded = Math.ceil(series.bestOf / 2);

    // Walk games in order, tracking the running series score so we can flag
    // elimination games (opponent at match point before the game).
    let w = 0;
    let l = 0;
    const games: RevealGame[] = (series.games ?? []).map((g) => {
      const youAreHome = g.homeId === you.id;
      const youScore = youAreHome ? g.homeScore : g.awayScore;
      const oppScore = youAreHome ? g.awayScore : g.homeScore;
      const won = g.winnerId === you.id;
      const isElimination = l === winsNeeded - 1; // a loss here would end the run
      if (won) w += 1;
      else l += 1;
      return { gameNo: g.gameNo, youScore, oppScore, won, isElimination };
    });

    const youWonSeries = series.winnerId === you.id;
    const isLastRound = !youWonSeries || ai === bracket.rounds.length - 1;

    rounds.push({
      roundAbsIndex: ai,
      roundName: roundName(ai, totalRounds),
      bestOf: series.bestOf,
      you: teamOf(bracket, you.id),
      opp: teamOf(bracket, oppId),
      games,
      youWonSeries,
      seriesW: w,
      seriesL: l,
      isLastRound,
    });

    if (!youWonSeries) break; // eliminated — path ends here
  }

  const end: RevealEnd = isChampion
    ? { kind: "champion" }
    : {
        kind: "eliminated",
        finish: placementLabel(
          rounds.length > 0 ? rounds[rounds.length - 1].roundAbsIndex : 0,
          size,
        ),
      };

  return { totalRounds, rounds, end };
}
