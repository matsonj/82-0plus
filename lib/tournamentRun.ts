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
