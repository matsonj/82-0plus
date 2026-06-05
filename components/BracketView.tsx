"use client";

import { useState } from "react";
import type {
  BracketResult,
  BracketTeam,
  SeriesResult,
  GameResult,
  GameBreakdown,
} from "@/lib/types";

// Round labels for the four playoff rounds (rounds[0..3]).
const ROUND_LABEL = ["Round 1", "Conf. Semifinals", "Conf. Finals", "The Final"];

function round1(n: number): string {
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
}

// One signed line in a per-team breakdown. Buffs read teal, penalties coral —
// mirrors ResultsPanel's Adj component.
function BreakLine({ label, value }: { label: string; value: number }) {
  const v = Math.round(value * 10) / 10;
  const color =
    v > 0 ? "var(--md-teal)" : v < 0 ? "var(--md-coral)" : "var(--md-ink-muted)";
  return (
    <div className="flex items-baseline justify-between gap-2 font-display text-[11px]">
      <span className="text-[var(--md-ink-muted)]">{label}</span>
      <span style={{ color }}>{round1(v)}</span>
    </div>
  );
}

function TeamBreakdown({
  name,
  b,
}: {
  name: string;
  b: GameBreakdown;
}) {
  return (
    <div className="flex-1 border border-[var(--md-paper-3)] bg-[var(--md-paper-2)] p-2">
      <div className="mb-1 truncate font-display text-[11px] font-bold">
        {name}
      </div>
      {/* fatigue & recoveryCarry are stored positive and SUBTRACTED. */}
      <BreakLine label="seed net" value={b.seedNet} />
      <BreakLine label="game score" value={b.gameScoreBuff} />
      <BreakLine label="sixth man" value={b.sixthManBuff} />
      <BreakLine label="height" value={b.heightBuff} />
      <BreakLine label="home" value={b.homeBuff} />
      <BreakLine label="fatigue" value={-b.fatigue} />
      <BreakLine label="recovery carry" value={-b.recoveryCarry} />
      <BreakLine label="random" value={b.randomFactor} />
      <div className="mt-1 flex items-baseline justify-between border-t border-[var(--md-ink)] pt-0.5 font-display text-[11px] font-bold">
        <span>adj</span>
        <span>{round1(b.adj)}</span>
      </div>
    </div>
  );
}

function GameRow({
  game,
  nameOf,
}: {
  game: GameResult;
  nameOf: (id: string) => string;
}) {
  const homeWon = game.winnerId === game.homeId;
  const hb = game.breakdown[game.homeId];
  const ab = game.breakdown[game.awayId];
  return (
    <div className="border-t border-[var(--md-paper-3)] py-2">
      <div className="flex items-baseline justify-between font-display text-[12px]">
        <span>
          Game {game.gameNo}:{" "}
          <span className={homeWon ? "font-bold" : ""}>
            {nameOf(game.homeId)}
          </span>{" "}
          vs{" "}
          <span className={!homeWon ? "font-bold" : ""}>
            {nameOf(game.awayId)}
          </span>
        </span>
        <span className="text-[var(--md-ink-muted)]">
          margin {round1(game.margin)}
        </span>
      </div>
      {hb && ab && (
        <div className="mt-1.5 flex gap-2">
          <TeamBreakdown name={nameOf(game.homeId)} b={hb} />
          <TeamBreakdown name={nameOf(game.awayId)} b={ab} />
        </div>
      )}
    </div>
  );
}

function SeriesCard({
  series,
  nameOf,
  teamOf,
  youId,
}: {
  series: SeriesResult;
  nameOf: (id: string) => string;
  teamOf: (id: string) => BracketTeam | undefined;
  youId?: string;
}) {
  const [open, setOpen] = useState(false);
  const hiWon = series.winnerId === series.hiId;
  const involvesYou =
    youId !== undefined && (series.hiId === youId || series.loId === youId);
  const hiTeam = teamOf(series.hiId);
  const loTeam = teamOf(series.loId);

  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="md-card w-full p-2.5 text-left transition-transform"
      style={{
        background: involvesYou ? "var(--md-yellow)" : "var(--md-white)",
        boxShadow: involvesYou ? "var(--md-shadow-sm)" : "none",
        cursor: "pointer",
      }}
    >
      <div className="flex items-center justify-between gap-2 font-display text-[12px] sm:text-[13px]">
        <span className={hiWon ? "font-bold" : ""}>
          {hiTeam ? `#${hiTeam.seed} ` : ""}
          {nameOf(series.hiId)}
          {series.hiId === youId ? " ★" : ""}
        </span>
        <span className="shrink-0 px-1 text-[var(--md-ink-muted)]">
          {series.scoreHi}–{series.scoreLo}
        </span>
        <span className={`text-right ${!hiWon ? "font-bold" : ""}`}>
          {loTeam ? `#${loTeam.seed} ` : ""}
          {nameOf(series.loId)}
          {series.loId === youId ? " ★" : ""}
        </span>
      </div>
      <div className="mt-1 text-center font-display text-[9px] uppercase tracking-wide text-[var(--md-ink-muted)]">
        best of {series.bestOf} · tap for {open ? "less" : "why"}
      </div>
      {open && (
        <div className="mt-1.5">
          {series.games.map((g) => (
            <GameRow key={g.gameNo} game={g} nameOf={nameOf} />
          ))}
        </div>
      )}
    </button>
  );
}

export function BracketView({
  bracket,
  youId,
}: {
  bracket: BracketResult;
  youId?: string;
}) {
  const byId = new Map(bracket.teams.map((t) => [t.id, t]));
  const nameOf = (id: string) => byId.get(id)?.name ?? id;
  const teamOf = (id: string) => byId.get(id);

  // rounds: [R1 (8), Semis (4), Conf Finals (2), Final (1)]. The Final is the
  // single last series; everything before it splits East / West by team conf.
  const finalRound = bracket.rounds[bracket.rounds.length - 1] ?? [];
  const earlierRounds = bracket.rounds.slice(0, -1);

  const confColumn = (conf: "East" | "West") =>
    earlierRounds.map((round) =>
      round.filter((s) => teamOf(s.hiId)?.conference === conf),
    );

  const east = confColumn("East");
  const west = confColumn("West");

  const Column = ({
    label,
    rounds,
    align,
  }: {
    label: string;
    rounds: SeriesResult[][];
    align: "left" | "right";
  }) => (
    <div className="flex flex-1 flex-col gap-3">
      <div
        className={`font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)] ${
          align === "right" ? "text-right" : "text-left"
        }`}
      >
        {label}
      </div>
      {rounds.map((series, r) => (
        <div key={r} className="flex flex-col gap-2">
          <div className="font-display text-[10px] uppercase tracking-wide text-[var(--md-ink-muted)]">
            {ROUND_LABEL[r]}
          </div>
          {series.map((s, i) => (
            <SeriesCard
              key={`${s.hiId}-${s.loId}-${i}`}
              series={s}
              nameOf={nameOf}
              teamOf={teamOf}
              youId={youId}
            />
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Conference columns feed the center Final. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Column label="East" rounds={east} align="left" />
        <Column label="West" rounds={west} align="right" />
      </div>

      {/* The Final */}
      {finalRound.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            {ROUND_LABEL[3]}
          </div>
          <div className="w-full max-w-md">
            {finalRound.map((s, i) => (
              <SeriesCard
                key={`final-${i}`}
                series={s}
                nameOf={nameOf}
                teamOf={teamOf}
                youId={youId}
              />
            ))}
          </div>
          <div className="md-capsule md-capsule--teal mt-1">
            🏆 {bracket.championName}
          </div>
        </div>
      )}
    </div>
  );
}
