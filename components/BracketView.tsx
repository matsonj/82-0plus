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

// A small seed chip — md-badge, square, conference-tinted via background.
function SeedBadge({ seed }: { seed?: number }) {
  if (seed === undefined) return null;
  return (
    <span
      className="md-badge shrink-0 text-[10px] leading-none"
      style={{ width: 18, height: 18 }}
    >
      {seed}
    </span>
  );
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
  won,
  b,
}: {
  name: string;
  won: boolean;
  b: GameBreakdown;
}) {
  return (
    <div className="flex-1 border-2 border-[var(--md-ink)] bg-[var(--md-paper-2)] p-2">
      <div
        className={`mb-1 truncate font-display text-[11px] ${
          won ? "font-bold" : "text-[var(--md-ink-muted)]"
        }`}
      >
        {won ? "▸ " : ""}
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
      <div className="mt-1 flex items-baseline justify-between border-t-2 border-[var(--md-ink)] pt-0.5 font-display text-[11px] font-bold">
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
    <div className="border-t border-[var(--md-paper-3)] pt-2">
      <div className="flex items-baseline justify-between gap-2 font-display text-[12px]">
        <span>
          <span className="text-[var(--md-ink-muted)]">G{game.gameNo}</span>{" "}
          <span className={homeWon ? "font-bold" : "text-[var(--md-ink-muted)]"}>
            {nameOf(game.homeId)}
          </span>{" "}
          <span className="text-[var(--md-ink-muted)]">vs</span>{" "}
          <span className={!homeWon ? "font-bold" : "text-[var(--md-ink-muted)]"}>
            {nameOf(game.awayId)}
          </span>
        </span>
        <span className="shrink-0 font-display text-[10px] uppercase tracking-wide text-[var(--md-ink-muted)]">
          by {round1(Math.abs(game.margin))}
        </span>
      </div>
      {hb && ab && (
        <div className="mt-1.5 flex gap-2">
          <TeamBreakdown name={nameOf(game.homeId)} won={homeWon} b={hb} />
          <TeamBreakdown name={nameOf(game.awayId)} won={!homeWon} b={ab} />
        </div>
      )}
    </div>
  );
}

// One side of a series card: seed badge + name + score, winner bold / loser muted.
function SeriesSide({
  team,
  name,
  isWinner,
  isYou,
  score,
}: {
  team: BracketTeam | undefined;
  name: string;
  isWinner: boolean;
  isYou: boolean;
  score: number;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 ${
        isWinner ? "" : "opacity-60"
      }`}
    >
      <SeedBadge seed={team?.seed} />
      <span
        className={`min-w-0 flex-1 truncate font-display text-[12px] sm:text-[13px] ${
          isWinner ? "font-bold" : ""
        }`}
      >
        {name}
        {isYou ? " ★" : ""}
      </span>
      <span
        className={`shrink-0 font-display text-[14px] tabular-nums ${
          isWinner ? "font-bold" : "text-[var(--md-ink-muted)]"
        }`}
      >
        {score}
      </span>
    </div>
  );
}

function SeriesCard({
  series,
  nameOf,
  teamOf,
  youId,
  isFinal = false,
}: {
  series: SeriesResult;
  nameOf: (id: string) => string;
  teamOf: (id: string) => BracketTeam | undefined;
  youId?: string;
  isFinal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hiWon = series.winnerId === series.hiId;
  const involvesYou =
    youId !== undefined && (series.hiId === youId || series.loId === youId);
  const hiTeam = teamOf(series.hiId);
  const loTeam = teamOf(series.loId);

  return (
    <div
      className={`md-card ${involvesYou || isFinal ? "md-card--lift" : ""}`}
      style={{ background: involvesYou ? "var(--md-yellow)" : "var(--md-white)" }}
    >
      {/* The matchup — higher seed on top. */}
      <div className="divide-y divide-[var(--md-paper-3)]">
        <SeriesSide
          team={hiTeam}
          name={nameOf(series.hiId)}
          isWinner={hiWon}
          isYou={series.hiId === youId}
          score={series.scoreHi}
        />
        <SeriesSide
          team={loTeam}
          name={nameOf(series.loId)}
          isWinner={!hiWon}
          isYou={series.loId === youId}
          score={series.scoreLo}
        />
      </div>

      {/* Expander — opt-in "why". */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border-t-2 border-[var(--md-ink)] px-2 py-1 text-left font-display text-[9px] uppercase tracking-wide text-[var(--md-ink-muted)]"
        style={{ cursor: "pointer" }}
      >
        <span>best of {series.bestOf}</span>
        <span>{open ? "hide ▴" : "why ▾"}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t-2 border-[var(--md-ink)] bg-[var(--md-paper)] p-2">
          {series.games.map((g) => (
            <GameRow key={g.gameNo} game={g} nameOf={nameOf} />
          ))}
        </div>
      )}
    </div>
  );
}

// A labeled stack of series for one round within a conference column.
function RoundGroup({
  label,
  series,
  align,
  nameOf,
  teamOf,
  youId,
}: {
  label: string;
  series: SeriesResult[];
  align: "left" | "right";
  nameOf: (id: string) => string;
  teamOf: (id: string) => BracketTeam | undefined;
  youId?: string;
}) {
  return (
    // Centered vertically so later (fewer) rounds line up against earlier ones,
    // giving the staggered bracket feel on wide screens.
    <div className="flex flex-1 flex-col justify-center gap-2">
      <div
        className={`font-display text-[10px] font-bold uppercase tracking-wide text-[var(--md-ink-muted)] ${
          align === "right" ? "text-right" : "text-left"
        }`}
      >
        {label}
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

  // East flows toward the center Final (R1 → ConfFinals left-to-right); West is
  // mirrored so it reads right-to-left into the same Final. On narrow screens
  // each conference simply stacks top-to-bottom.
  const ConfRail = ({
    conf,
    rounds,
    dir,
  }: {
    conf: string;
    rounds: SeriesResult[][];
    dir: "ltr" | "rtl";
  }) => {
    const align = dir === "rtl" ? "right" : "left";
    const groups = rounds.map((series, r) => (
      <RoundGroup
        key={r}
        label={ROUND_LABEL[r]}
        series={series}
        align={align}
        nameOf={nameOf}
        teamOf={teamOf}
        youId={youId}
      />
    ));
    return (
      <div className="flex flex-col gap-2">
        <div
          className={`md-capsule ${
            conf === "West" ? "md-capsule--sky" : ""
          } self-start ${dir === "rtl" ? "lg:self-end" : ""}`}
        >
          {conf}
        </div>
        {/* Stacked on mobile, side-by-side rounds (a true bracket) on desktop. */}
        <div
          className={`flex flex-col gap-3 lg:flex-row lg:gap-4 ${
            dir === "rtl" ? "lg:flex-row-reverse" : ""
          }`}
        >
          {groups}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* The two conference rails. On lg, East sits left, West right, both
          feeding the Final below. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-5">
        <ConfRail conf="East" rounds={east} dir="ltr" />
        <ConfRail conf="West" rounds={west} dir="rtl" />
      </div>

      {/* The Final — center stage. */}
      {finalRound.length > 0 && (
        <div className="flex flex-col items-center gap-3 border-t-2 border-dashed border-[var(--md-paper-3)] pt-5">
          <div className="md-capsule md-capsule--coral">{ROUND_LABEL[3]}</div>
          <div className="w-full max-w-sm">
            {finalRound.map((s, i) => (
              <SeriesCard
                key={`final-${i}`}
                series={s}
                nameOf={nameOf}
                teamOf={teamOf}
                youId={youId}
                isFinal
              />
            ))}
          </div>
          <div className="md-capsule md-capsule--teal">
            🏆 {bracket.championName}
          </div>
        </div>
      )}
    </div>
  );
}
