import { describe, it, expect } from "vitest";
import { deriveYou } from "./tournamentRun";
import type { BracketResult, BracketTeam, SeriesResult } from "./types";

// Minimal bracket factory: ME is `sub:ME`, opponents are ghost ids. We only need
// `teams` (for identity) and `rounds` (for the reachedRound walk) populated.
function team(id: string, seed: number): BracketTeam {
  return { id, name: id, isGhost: id !== "sub:ME", conference: "East", seed, seedNet: 0 };
}

function series(hiId: string, loId: string, winnerId: string): SeriesResult {
  return { hiId, loId, bestOf: 5, games: [], winnerId, scoreHi: 3, scoreLo: 0 };
}

function bracket(rounds: SeriesResult[][]): BracketResult {
  return {
    teams: [team("sub:ME", 1), team("g:1", 8), team("g:2", 4), team("g:3", 2), team("g:4", 3)],
    rounds,
    championId: "sub:ME",
    championName: "ME",
  };
}

describe("deriveYou", () => {
  it("reachedRound 0 when the team loses its first series", () => {
    const b = bracket([[series("sub:ME", "g:1", "g:1")]]);
    expect(deriveYou(b, "sub:ME").reachedRound).toBe(0);
  });

  it("reachedRound counts consecutive series wins", () => {
    const b = bracket([
      [series("sub:ME", "g:1", "sub:ME")], // R1 win → 1
      [series("sub:ME", "g:2", "sub:ME")], // R2 win → 2
      [series("sub:ME", "g:3", "g:3")], // R3 loss → stop
    ]);
    expect(deriveYou(b, "sub:ME").reachedRound).toBe(2);
  });

  it("reachedRound 4 for the champion (won the Final)", () => {
    const b = bracket([
      [series("sub:ME", "g:1", "sub:ME")],
      [series("sub:ME", "g:2", "sub:ME")],
      [series("sub:ME", "g:3", "sub:ME")],
      [series("sub:ME", "g:4", "sub:ME")], // won the Final → 4
    ]);
    expect(deriveYou(b, "sub:ME").reachedRound).toBe(4);
  });

  it("carries identity (id/name/conference/seed) from bracket.teams", () => {
    const b = bracket([[series("sub:ME", "g:1", "g:1")]]);
    const you = deriveYou(b, "sub:ME");
    expect(you).toMatchObject({ id: "sub:ME", name: "sub:ME", conference: "East", seed: 1 });
  });

  it("throws when the team isn't in the bracket", () => {
    const b = bracket([[series("sub:ME", "g:1", "g:1")]]);
    expect(() => deriveYou(b, "sub:NOPE")).toThrow();
  });
});
