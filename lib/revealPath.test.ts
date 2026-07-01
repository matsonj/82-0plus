import { describe, it, expect } from "vitest";
import { buildRevealScript } from "./revealPath";
import type {
  BracketResult,
  BracketTeam,
  GameResult,
  SeriesResult,
  TournamentYou,
} from "./types";

// ── fixture builders ──────────────────────────────────────────────────────
function game(
  gameNo: number,
  homeId: string,
  awayId: string,
  homeScore: number,
  awayScore: number,
): GameResult {
  return {
    gameNo,
    homeId,
    awayId,
    winnerId: homeScore > awayScore ? homeId : awayId,
    margin: homeScore - awayScore,
    homeScore,
    awayScore,
  };
}

function series(
  hiId: string,
  loId: string,
  games: GameResult[],
): SeriesResult {
  let scoreHi = 0;
  let scoreLo = 0;
  for (const g of games) g.winnerId === hiId ? scoreHi++ : scoreLo++;
  return {
    hiId,
    loId,
    bestOf: 7,
    games,
    winnerId: scoreHi > scoreLo ? hiId : loId,
    scoreHi,
    scoreLo,
  };
}

function team(id: string, seed: number, seedNet: number): BracketTeam {
  return { id, name: id, isGhost: false, conference: "East", seed, seedNet };
}

const YOU: TournamentYou = {
  id: "A",
  name: "A",
  conference: "East",
  seed: 1,
  reachedRound: 0,
};

// A wins a 5-game series 4-1 (loses game 3).
const winGames = (hi: string, lo: string) => [
  game(1, hi, lo, 110, 100),
  game(2, hi, lo, 108, 99),
  game(3, lo, hi, 105, 100),
  game(4, hi, lo, 112, 100),
  game(5, hi, lo, 107, 98),
];

describe("buildRevealScript", () => {
  it("walks a champion's full path and ends in 'champion'", () => {
    const bracket: BracketResult = {
      teams: [team("A", 1, 10), team("B", 2, 4), team("C", 1, 6), team("D", 2, 2)],
      rounds: [
        [series("A", "B", winGames("A", "B")), series("C", "D", winGames("C", "D"))],
        [series("A", "C", winGames("A", "C"))],
      ],
      championId: "A",
      championName: "A",
      size: 4,
    };
    const s = buildRevealScript(bracket, YOU);
    expect(s.totalRounds).toBe(2);
    expect(s.rounds.map((r) => r.roundName)).toEqual(["Conf Finals", "The Final"]);
    expect(s.rounds[0].youWonSeries).toBe(true);
    expect(s.rounds[0].seriesW).toBe(4);
    expect(s.rounds[0].seriesL).toBe(1);
    expect(s.rounds[0].isLastRound).toBe(false);
    expect(s.rounds[1].isLastRound).toBe(true);
    // score mapping: A is home in game 1 (won), away in game 3 (lost)
    expect(s.rounds[0].games[0]).toMatchObject({ youScore: 110, oppScore: 100, won: true });
    expect(s.rounds[0].games[2]).toMatchObject({ youScore: 100, oppScore: 105, won: false });
    expect(s.end).toEqual({ kind: "champion" });
  });

  it("stops at the round the viewer loses and flags the elimination game", () => {
    // A loses to B 2-4 over 6 games; B reaches match point (3 wins) before game 6.
    const lossGames = [
      game(1, "A", "B", 110, 100), // A W
      game(2, "B", "A", 105, 100), // B W
      game(3, "A", "B", 109, 99), // A W
      game(4, "B", "A", 108, 100), // B W
      game(5, "A", "B", 98, 105), // B W (A home, loses)
      game(6, "B", "A", 110, 100), // B W — elimination game
    ];
    const bracket: BracketResult = {
      teams: [team("A", 1, 8), team("B", 8, -2)],
      rounds: [[series("A", "B", lossGames)], [series("X", "Y", winGames("X", "Y"))]],
      championId: "B",
      championName: "B",
      size: 4,
    };
    const s = buildRevealScript(bracket, YOU);
    expect(s.rounds).toHaveLength(1);
    expect(s.rounds[0].youWonSeries).toBe(false);
    expect(s.rounds[0].seriesW).toBe(2);
    expect(s.rounds[0].seriesL).toBe(4);
    expect(s.rounds[0].games.map((g) => g.isElimination)).toEqual([
      false, false, false, false, false, true,
    ]);
    expect(s.end).toEqual({ kind: "eliminated", finish: "Round 1 exit" });
  });

  it("labels placement by the round lost (Top 4 at conf finals, size 16)", () => {
    const lossGames = [
      game(1, "B", "A", 110, 100),
      game(2, "B", "A", 108, 99),
      game(3, "A", "B", 105, 100),
      game(4, "B", "A", 112, 100),
    ]; // B wins 3-1... need 4; add one
    lossGames.push(game(5, "B", "A", 101, 95)); // B 4-1
    const bracket: BracketResult = {
      teams: [team("A", 1, 12), team("B", 2, 9)],
      rounds: [
        [series("A", "z1", winGames("A", "z1"))],
        [series("A", "z2", winGames("A", "z2"))],
        [series("B", "A", lossGames)], // conf finals: A loses
        [series("p", "q", winGames("p", "q"))], // final (A absent)
      ],
      championId: "B",
      championName: "B",
      size: 16,
    };
    const s = buildRevealScript(bracket, YOU);
    expect(s.rounds).toHaveLength(3);
    expect(s.rounds[2].roundName).toBe("Conf Finals");
    expect(s.rounds[2].youWonSeries).toBe(false);
    expect(s.end).toEqual({ kind: "eliminated", finish: "Top 4" });
  });
});
