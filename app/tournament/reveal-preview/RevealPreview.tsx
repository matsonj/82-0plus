"use client";

// DEV-ONLY harness for tuning the SIMULATE reveal without drafting a real team.
// Builds a sample bracket for a chosen outcome and mounts SimulateReveal. Not
// linked anywhere; the route is gated to non-production in page.tsx.

import { useState } from "react";
import type {
  BracketResult,
  BracketTeam,
  GameResult,
  SeriesResult,
  TournamentRunResponse,
} from "@/lib/types";
import { SimulateReveal } from "@/components/SimulateReveal";

type Outcome = "champion" | "runnerup" | "earlyout";

interface Opp {
  id: string;
  name: string;
  seed: number;
  seedNet: number;
}
interface GameSpec {
  w: boolean;
  ys: number;
  os: number;
}

function mkGame(no: number, youId: string, oppId: string, ys: number, os: number): GameResult {
  return {
    gameNo: no,
    homeId: youId,
    awayId: oppId,
    winnerId: ys > os ? youId : oppId,
    margin: ys - os,
    homeScore: ys,
    awayScore: os,
  };
}

function mkSeries(youId: string, opp: Opp, specs: GameSpec[]): SeriesResult {
  const games = specs.map((s, i) => mkGame(i + 1, youId, opp.id, s.ys, s.os));
  let scoreHi = 0;
  let scoreLo = 0;
  for (const g of games) g.winnerId === youId ? scoreHi++ : scoreLo++;
  return {
    hiId: youId,
    loId: opp.id,
    bestOf: 7,
    games,
    winnerId: scoreHi > scoreLo ? youId : opp.id,
    scoreHi,
    scoreLo,
  };
}

const YOU_ID = "YOU";

// Per-outcome round scripts (size-8 bracket → 3 rounds).
const OPPS: Opp[] = [
  { id: "CEL", name: "CELLAR", seed: 8, seedNet: -2 },
  { id: "GEN", name: "GENERALS", seed: 4, seedNet: 6 },
  { id: "EMP", name: "EMPIRE", seed: 2, seedNet: 9 },
];

const SWEEP41: GameSpec[] = [
  { w: true, ys: 110, os: 100 },
  { w: true, ys: 108, os: 99 },
  { w: false, ys: 99, os: 101 },
  { w: true, ys: 112, os: 100 },
  { w: true, ys: 115, os: 106 },
];
// 4-3 gauntlet: fall behind 1-3, then win three straight elimination games.
const GAUNTLET43: GameSpec[] = [
  { w: true, ys: 120, os: 110 },
  { w: false, ys: 100, os: 108 },
  { w: false, ys: 99, os: 105 },
  { w: false, ys: 98, os: 107 },
  { w: true, ys: 110, os: 102 },
  { w: true, ys: 112, os: 104 },
  { w: true, ys: 115, os: 106 },
];
const WINFINAL42: GameSpec[] = [
  { w: true, ys: 115, os: 108 },
  { w: true, ys: 109, os: 98 },
  { w: false, ys: 100, os: 104 },
  { w: true, ys: 120, os: 110 },
  { w: false, ys: 99, os: 107 },
  { w: true, ys: 113, os: 105 },
];
// Lose 2-4: down 2-3, lose the elimination game.
const LOSE24: GameSpec[] = [
  { w: true, ys: 110, os: 100 },
  { w: false, ys: 98, os: 105 },
  { w: true, ys: 109, os: 99 },
  { w: false, ys: 100, os: 108 },
  { w: false, ys: 101, os: 106 },
  { w: false, ys: 99, os: 110 },
];

function buildSample(outcome: Outcome): TournamentRunResponse {
  const team = (id: string, name: string, seed: number, seedNet: number): BracketTeam => ({
    id, name, isGhost: id !== YOU_ID, conference: "East", seed, seedNet,
  });
  const youTeam = team(YOU_ID, "MANIACS", 1, 13);
  const teams: BracketTeam[] = [youTeam, ...OPPS.map((o) => team(o.id, o.name, o.seed, o.seedNet))];

  let rounds: SeriesResult[][];
  let championId: string;
  let reachedRound: number;

  if (outcome === "earlyout") {
    rounds = [[mkSeries(YOU_ID, OPPS[0], LOSE24)]];
    championId = OPPS[0].id;
    reachedRound = 0;
  } else if (outcome === "runnerup") {
    rounds = [
      [mkSeries(YOU_ID, OPPS[0], SWEEP41)],
      [mkSeries(YOU_ID, OPPS[1], GAUNTLET43)],
      [mkSeries(YOU_ID, OPPS[2], LOSE24)],
    ];
    championId = OPPS[2].id;
    reachedRound = 2;
  } else {
    rounds = [
      [mkSeries(YOU_ID, OPPS[0], SWEEP41)],
      [mkSeries(YOU_ID, OPPS[1], GAUNTLET43)],
      [mkSeries(YOU_ID, OPPS[2], WINFINAL42)],
    ];
    championId = YOU_ID;
    reachedRound = 3;
  }

  const bracket: BracketResult = {
    teams,
    rounds,
    championId,
    championName: teams.find((t) => t.id === championId)?.name ?? "",
    size: 8,
  };
  return {
    bracket,
    you: { id: YOU_ID, name: "MANIACS", conference: "East", seed: 1, reachedRound },
  };
}

export function RevealPreview() {
  const [outcome, setOutcome] = useState<Outcome>("champion");
  const [runKey, setRunKey] = useState(0);
  const sample = buildSample(outcome);

  const pick = (o: Outcome) => {
    setOutcome(o);
    setRunKey((k) => k + 1);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] text-[var(--md-ink-muted)]">preview outcome:</span>
        {(["champion", "runnerup", "earlyout"] as Outcome[]).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => pick(o)}
            className="border-2 border-[var(--md-ink)] px-3 py-1 font-cond text-[12px] font-semibold uppercase tracking-[0.1em]"
            style={{
              background: outcome === o ? "var(--md-ink)" : "var(--md-white)",
              color: outcome === o ? "var(--md-white)" : "var(--md-ink)",
              cursor: "pointer",
            }}
          >
            {o}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setRunKey((k) => k + 1)}
          className="ml-2 border-2 border-[var(--md-ink)] px-3 py-1 font-cond text-[12px] font-semibold uppercase tracking-[0.1em]"
          style={{ background: "var(--md-coral)", color: "var(--md-white)", cursor: "pointer" }}
        >
          Replay ↻
        </button>
      </div>
      <SimulateReveal
        key={`${outcome}-${runKey}`}
        data={sample}
        mode="hoopiq"
        onDismiss={() => setRunKey((k) => k + 1)}
      />
    </div>
  );
}
