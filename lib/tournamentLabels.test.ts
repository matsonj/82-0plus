import { describe, it, expect } from "vitest";
import { playInEarnedSeeds } from "./tournamentLabels";
import type { BracketResult, GameResult, PlayInResult } from "./types";

// Minimal single game (only the fields playInEarnedSeeds / the UI read).
function game(homeId: string, awayId: string, winnerId: string): GameResult {
  const homeWon = winnerId === homeId;
  return {
    gameNo: 1,
    homeId,
    awayId,
    winnerId,
    margin: homeWon ? 6 : -6,
    homeScore: homeWon ? 104 : 98,
    awayScore: homeWon ? 98 : 104,
  };
}

// One conference of play-in: A(7v8), B(9v10 feeder), C(8-seed decider).
function conferencePlayIn(
  conference: "East" | "West",
  ids: { s7: string; s8: string; s9: string; s10: string },
  outcome: {
    aWinner: string; // winner of 7v8 → seed 7
    bWinner: string; // winner of 9v10 → advances to decider
    cWinner: string; // winner of decider → seed 8
  },
): PlayInResult[] {
  const { s7, s8, s9, s10 } = ids;
  const aLoser = outcome.aWinner === s7 ? s8 : s7;
  const bLoser = outcome.bWinner === s9 ? s10 : s9;
  // Decider: A-loser vs B-winner (hi = A-loser, the higher seed).
  return [
    { conference, forSeed: 7, hiId: s7, loId: s8, game: game(s7, s8, outcome.aWinner), winnerId: outcome.aWinner },
    { conference, forSeed: 8, hiId: s9, loId: s10, game: game(s9, s10, outcome.bWinner), winnerId: outcome.bWinner },
    { conference, forSeed: 8, hiId: aLoser, loId: outcome.bWinner, game: game(aLoser, outcome.bWinner, outcome.cWinner), winnerId: outcome.cWinner },
  ];
}

function bracketWith(playIn: PlayInResult[]): BracketResult {
  return { teams: [], rounds: [], championId: "x", championName: "x", size: 20, playIn };
}

describe("playInEarnedSeeds", () => {
  it("assigns 7/8/9/10 by outcome, not entry seed", () => {
    // East: 7-seed wins 7v8 (→7). 9-seed wins 9v10, then wins the decider (→8),
    // so the 8-seed lost the decider (→9) and the 10-seed lost 9v10 (→10).
    const playIn = conferencePlayIn(
      "East",
      { s7: "e7", s8: "e8", s9: "e9", s10: "e10" },
      { aWinner: "e7", bWinner: "e9", cWinner: "e9" },
    );
    const seeds = playInEarnedSeeds(bracketWith(playIn));
    expect(seeds.get("e7")).toBe(7);
    expect(seeds.get("e9")).toBe(8); // won the decider
    expect(seeds.get("e8")).toBe(9); // reached the decider, lost it
    expect(seeds.get("e10")).toBe(10); // out first
  });

  it("handles the 8-seed clinching via the decider across two conferences", () => {
    const east = conferencePlayIn(
      "East",
      { s7: "e7", s8: "e8", s9: "e9", s10: "e10" },
      { aWinner: "e8", bWinner: "e10", cWinner: "e7" }, // A-loser e7 wins decider → 8
    );
    const west = conferencePlayIn(
      "West",
      { s7: "w7", s8: "w8", s9: "w9", s10: "w10" },
      { aWinner: "w7", bWinner: "w9", cWinner: "w8" }, // A-loser w8 wins decider → 8
    );
    const seeds = playInEarnedSeeds(bracketWith([...east, ...west]));
    // East
    expect(seeds.get("e8")).toBe(7); // won 7v8
    expect(seeds.get("e7")).toBe(8); // won the decider
    expect(seeds.get("e10")).toBe(9); // lost the decider (B-winner)
    expect(seeds.get("e9")).toBe(10); // lost 9v10
    // West
    expect(seeds.get("w7")).toBe(7);
    expect(seeds.get("w8")).toBe(8);
    expect(seeds.get("w9")).toBe(9);
    expect(seeds.get("w10")).toBe(10);
  });

  it("returns an empty map when there is no play-in", () => {
    const seeds = playInEarnedSeeds({
      teams: [], rounds: [], championId: "x", championName: "x", size: 16,
    });
    expect(seeds.size).toBe(0);
  });
});
