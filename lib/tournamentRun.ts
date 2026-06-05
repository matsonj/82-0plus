// Pure helper shared by the tournament submit + lookup routes. No I/O.
//
// `deriveYou` locates the human's team inside a resolved BracketResult and works
// out how far it got. The bracket already carries identity (id, name, conference,
// seed) in `bracket.teams`, and the outcome in `bracket.rounds`.
//
// reachedRound semantics (matches TournamentYou):
//   0 = lost in the round-1 series
//   1 = won R1, lost the conference semifinal
//   2 = won the semfinal, lost the conference final
//   3 = won the conference final, lost the Final
//   4 = won the Final (champion)
// A team "reached round r+1" iff it WON its series in rounds[r]. So we count the
// number of leading rounds in which the team appears AND wins; that count is the
// reachedRound (each series win advances the team one round).

import type { BracketResult, TournamentYou } from "./types";

/**
 * Project a bracket for the client with the per-game modifier `breakdown` (the
 * tuning/"WHY" internals: seedNet, buffs, fatigue, randomFactor, adj) REMOVED.
 * Those leak the model otherwise — anyone could read them from the API/devtools.
 * Routes return the full bracket only on an explicit server debug path. The box
 * scores, winner, and series outcomes are kept (they're player-facing).
 */
export function stripBreakdown(bracket: BracketResult): BracketResult {
  return {
    ...bracket,
    rounds: bracket.rounds.map((round) =>
      round.map((series) => ({
        ...series,
        games: series.games.map(({ breakdown: _omit, ...game }) => game),
      })),
    ),
  };
}

/** A team's realized playoff line: W-L, average point margin, and how far it got. */
export interface TeamRecord {
  recordW: number;
  recordL: number;
  realizedMargin: number; // avg (teamScore − oppScore) across the team's games
  reachedRound: number;
}

/**
 * Walk the bracket for one team and total its game record + average point margin
 * (using the per-game box scores) across every series it played. Stops at the
 * first round it loses (or doesn't appear in). Used to memorialize a team.
 */
export function deriveRecord(
  bracket: BracketResult,
  teamId: string,
): TeamRecord {
  let recordW = 0,
    recordL = 0,
    marginSum = 0,
    games = 0,
    reachedRound = 0;
  for (const round of bracket.rounds) {
    const series = round.find((s) => s.hiId === teamId || s.loId === teamId);
    if (!series) break;
    for (const g of series.games) {
      const isHome = g.homeId === teamId;
      const mine = isHome ? g.homeScore : g.awayScore;
      const opp = isHome ? g.awayScore : g.homeScore;
      marginSum += mine - opp;
      games += 1;
      if (g.winnerId === teamId) recordW += 1;
      else recordL += 1;
    }
    if (series.winnerId !== teamId) break;
    reachedRound += 1;
  }
  return {
    recordW,
    recordL,
    realizedMargin: games > 0 ? Math.round((marginSum / games) * 10) / 10 : 0,
    reachedRound,
  };
}

export function deriveYou(
  bracket: BracketResult,
  teamId: string,
): TournamentYou {
  const team = bracket.teams.find((t) => t.id === teamId);
  if (!team) {
    throw new Error(`team ${teamId} not found in bracket`);
  }

  // Walk rounds in order; each round the team played AND won bumps reachedRound.
  // The first round it played and LOST (or didn't appear in) stops the walk.
  let reachedRound = 0;
  for (const round of bracket.rounds) {
    const series = round.find(
      (s) => s.hiId === teamId || s.loId === teamId,
    );
    if (!series) break; // team isn't in this round → it was eliminated earlier
    if (series.winnerId !== teamId) break; // lost here → done advancing
    reachedRound += 1; // won this series → advanced one round
  }

  return {
    id: team.id,
    name: team.name,
    conference: team.conference,
    seed: team.seed,
    reachedRound,
  };
}
