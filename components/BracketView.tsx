"use client";

import { useState } from "react";
import type {
  BracketResult,
  BracketTeam,
  BracketPlayer,
  SeriesResult,
  GameResult,
  GameBreakdown,
} from "@/lib/types";

// Derives a round label from the round's distance to the final (0 = final round).
// Used by both the desktop tree and the mobile stacked view.
function roundLabel(distFromFinal: number): string {
  switch (distFromFinal) {
    case 0: return "Final";
    case 1: return "Semifinals";
    case 2: return "Quarterfinals";
    case 3: return "Round of 16";
    case 4: return "Round of 32";
    default: return `Round of ${Math.pow(2, distFromFinal + 1)}`;
  }
}

function round1(n: number): string {
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
}

// A small seed chip — ink square, white label.
function SeedBadge({ seed }: { seed?: number }) {
  if (seed === undefined) return null;
  return (
    <span
      className="md-badge inline-flex items-center justify-center shrink-0 font-mono text-[10px] leading-none"
      style={{ width: 18, height: 18 }}
    >
      {seed}
    </span>
  );
}

// One signed line in a per-team breakdown.
function BreakLine({ label, value }: { label: string; value: number }) {
  const v = Math.round(value * 10) / 10;
  const color =
    v > 0 ? "var(--md-teal)" : v < 0 ? "var(--md-coral)" : "var(--md-ink-muted)";
  return (
    <div className="flex items-baseline justify-between gap-2 font-mono text-[11px]">
      <span className="whitespace-nowrap text-[var(--md-ink-muted)]">{label}</span>
      <span className="shrink-0" style={{ color }}>{round1(v)}</span>
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
        className={`mb-1 truncate font-mono text-[11px] ${
          won ? "font-bold" : "text-[var(--md-ink-muted)]"
        }`}
      >
        {won ? "▸ " : ""}
        {name}
      </div>
      {/* fatigue & recoveryCarry are stored positive and SUBTRACTED. */}
      <BreakLine label="seed" value={b.seedNet} />
      <BreakLine label="game score" value={b.gameScoreBuff} />
      <BreakLine label="height" value={b.heightBuff} />
      <BreakLine label="home" value={b.homeBuff} />
      <BreakLine label="fatigue" value={-b.fatigue} />
      <BreakLine label="recovery" value={-b.recoveryCarry} />
      <BreakLine label="random" value={b.randomFactor} />
      <div className="mt-1 flex items-baseline justify-between border-t-2 border-[var(--md-ink)] pt-0.5 font-mono text-[11px] font-bold">
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
  const hb = game.breakdown?.[game.homeId];
  const ab = game.breakdown?.[game.awayId];
  return (
    <div className="border-t border-[var(--md-paper-3)] pt-2">
      <div className="flex items-baseline justify-between gap-2 font-mono text-[12px]">
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
        <span className="shrink-0 font-mono text-[12px] font-bold tabular-nums">
          {game.homeScore}&ndash;{game.awayScore}
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

// A stable identity for a drafted player, used to spot the same player across
// multiple teams.
export const playerKey = (p: BracketPlayer) => `${p.name}|${p.team}|${p.season}`;

// One player row in a roster panel.
function PlayerRow({ p, shared }: { p: BracketPlayer; shared?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 font-mono text-[11px]">
      <span
        className={`min-w-0 truncate ${shared ? "italic pr-1 text-[var(--md-ink-muted)]" : ""}`}
        title={shared ? "You drafted this player too" : undefined}
      >
        {p.name}
        {p.captain ? (
          <span className="ml-1 inline-block border border-[var(--md-ink)] bg-[var(--md-yellow)] px-1 text-[8px] font-bold uppercase leading-tight tracking-wide align-middle">
            C
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-[10px] text-[var(--md-coral-deep)]">
        {p.team} &rsquo;{String(p.season).slice(2)}
      </span>
    </div>
  );
}

// The five starters (+ optional sixth man) as player rows. Exported for reuse.
export function RosterList({
  roster,
  sixthMan,
  compareKeys,
}: {
  roster: BracketPlayer[];
  sixthMan?: BracketPlayer;
  compareKeys?: Set<string>;
}) {
  const isShared = (p: BracketPlayer) => compareKeys?.has(playerKey(p)) ?? false;
  return (
    <>
      {roster.map((p, i) => (
        <PlayerRow key={`${p.team}-${p.name}-${i}`} p={p} shared={isShared(p)} />
      ))}
      {sixthMan && (
        <>
          <div className="my-1 border-t-2 border-[var(--md-ink)]" />
          <div className="font-cond text-[8px] font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            Sixth Man
          </div>
          <PlayerRow p={sixthMan} shared={isShared(sixthMan)} />
        </>
      )}
    </>
  );
}

// The expandable roster panel for one team in a bracket.
function RosterPanel({
  team,
  compareKeys,
}: {
  team: BracketTeam | undefined;
  compareKeys?: Set<string>;
}) {
  if (!team || team.roster === undefined) {
    return (
      <div className="border-t-2 border-dashed border-[var(--md-ink)] bg-[var(--md-paper)] px-2 py-1.5 font-mono text-[10px] italic text-[var(--md-ink-muted)]">
        roster unavailable
      </div>
    );
  }
  return (
    <div className="border-t-2 border-dashed border-[var(--md-ink)] bg-[var(--md-paper)] px-2 py-1.5">
      <RosterList
        roster={team.roster}
        sixthMan={team.sixthMan}
        compareKeys={compareKeys}
      />
    </div>
  );
}

// ─── SERIES CARD ────────────────────────────────────────────────────────────
// Used in both the stacked mobile view and the horizontal desktop tree.
// Two rows: winner (ink bg, red score) + loser (muted). Optional per-game
// scores expandable via "see scores" toggle.
// NOTE: scoreHi/scoreLo are game-win counts (not best-of-7 series wins).

function SeriesCard({
  series,
  nameOf,
  teamOf,
  youId,
  youKeys,
  isFinal = false,
  compact = false,
}: {
  series: SeriesResult;
  nameOf: (id: string) => string;
  teamOf: (id: string) => BracketTeam | undefined;
  youId?: string;
  youKeys?: Set<string>;
  isFinal?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState<"hi" | "lo" | null>(null);
  const hiWon = series.winnerId === series.hiId;
  const involvesYou =
    youId !== undefined && (series.hiId === youId || series.loId === youId);
  const hiTeam = teamOf(series.hiId);
  const loTeam = teamOf(series.loId);
  const compareFor = (id: string) => (id === youId ? undefined : youKeys);
  const toggleRoster = (side: "hi" | "lo") =>
    setRosterOpen((cur) => (cur === side ? null : side));

  const hiIsYou = series.hiId === youId;
  const loIsYou = series.loId === youId;

  // Series record: "4-1 (W)" / "1-4 (L)".
  // scoreHi and scoreLo hold game-win counts for each side.
  const hiRecord = `${series.scoreHi}-${series.scoreLo} (${hiWon ? "W" : "L"})`;
  const loRecord = `${series.scoreLo}-${series.scoreHi} (${hiWon ? "L" : "W"})`;

  const py = compact ? "py-1.5" : "py-2";
  const nameSize = compact ? "text-[11px]" : "text-[12px] sm:text-[13px]";
  const scoreWidth = compact ? 64 : 72;

  return (
    <div
      className={`border-2 border-[var(--md-ink)]`}
      style={{
        background: "var(--md-white)",
        boxShadow: involvesYou || isFinal ? "var(--md-shadow-sm)" : undefined,
      }}
    >
      {/* Hi team row */}
      <div
        className={`flex items-center gap-2 border-b border-[var(--md-paper-3)] px-2 ${py}`}
        style={
          hiIsYou
            ? { background: "rgba(43,75,255,0.15)", boxShadow: "inset 4px 0 0 var(--md-cobalt)" }
            : undefined
        }
      >
        <SeedBadge seed={hiTeam?.seed} />
        <button
          type="button"
          onClick={() => toggleRoster("hi")}
          className="min-w-0 flex-1 truncate text-left"
          aria-expanded={rosterOpen === "hi"}
          style={{ cursor: "pointer" }}
        >
          <span
            className={`font-mono ${nameSize} uppercase tracking-[0.02em]`}
            style={{
              fontWeight: hiWon ? 700 : 400,
              color: hiWon ? "var(--md-ink)" : "var(--md-ink-muted)",
            }}
          >
            {hiTeam?.isGhost ? "🤖 " : ""}
            {nameOf(series.hiId)}
            {hiIsYou ? " ★" : ""}
          </span>
          <span className="ml-1 text-[9px] text-[var(--md-ink-muted)]">
            {rosterOpen === "hi" ? "▴" : "▾"}
          </span>
        </button>
        <span
          className="shrink-0 font-mono text-[13px] font-bold tabular-nums"
          style={{
            color: hiWon ? "var(--md-coral)" : "var(--md-ink-muted)",
            minWidth: scoreWidth,
            textAlign: "right",
          }}
        >
          {hiRecord}
        </span>
      </div>
      {rosterOpen === "hi" && (
        <RosterPanel team={hiTeam} compareKeys={compareFor(series.hiId)} />
      )}

      {/* Lo team row */}
      <div
        className={`flex items-center gap-2 px-2 ${py}`}
        style={
          loIsYou
            ? { background: "rgba(43,75,255,0.15)", boxShadow: "inset 4px 0 0 var(--md-cobalt)" }
            : undefined
        }
      >
        <SeedBadge seed={loTeam?.seed} />
        <button
          type="button"
          onClick={() => toggleRoster("lo")}
          className="min-w-0 flex-1 truncate text-left"
          aria-expanded={rosterOpen === "lo"}
          style={{ cursor: "pointer" }}
        >
          <span
            className={`font-mono ${nameSize} uppercase tracking-[0.02em]`}
            style={{
              fontWeight: hiWon ? 400 : 700,
              color: hiWon ? "var(--md-ink-muted)" : "var(--md-ink)",
            }}
          >
            {loTeam?.isGhost ? "🤖 " : ""}
            {nameOf(series.loId)}
            {loIsYou ? " ★" : ""}
          </span>
          <span className="ml-1 text-[9px] text-[var(--md-ink-muted)]">
            {rosterOpen === "lo" ? "▴" : "▾"}
          </span>
        </button>
        <span
          className="shrink-0 font-mono text-[13px] font-bold tabular-nums"
          style={{
            color: hiWon ? "var(--md-ink-muted)" : "var(--md-coral)",
            minWidth: scoreWidth,
            textAlign: "right",
          }}
        >
          {loRecord}
        </span>
      </div>
      {rosterOpen === "lo" && (
        <RosterPanel team={loTeam} compareKeys={compareFor(series.loId)} />
      )}

      {/* Per-game scores toggle */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border-t-2 border-[var(--md-ink)] px-2 py-1 text-left font-mono text-[9px] uppercase tracking-wide text-[var(--md-ink-muted)]"
        style={{ cursor: "pointer", background: "var(--md-paper-2)" }}
        aria-expanded={open}
      >
        <span>best of {series.bestOf}</span>
        <span>{open ? "hide ▴" : "see scores ▾"}</span>
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

// Conference tag shown on each non-final series in the mobile stacked view.
function ConfTag({ conf }: { conf?: string }) {
  if (!conf) return null;
  return (
    <span
      className={`md-capsule ${conf === "West" ? "md-capsule--violet" : "md-capsule--coral"} px-1.5 py-0.5 text-[8px]`}
    >
      {conf}
    </span>
  );
}

// One full round section — used in the MOBILE stacked layout only.
function RoundSection({
  label,
  series,
  nameOf,
  teamOf,
  youId,
  youKeys,
}: {
  label: string;
  series: SeriesResult[];
  nameOf: (id: string) => string;
  teamOf: (id: string) => BracketTeam | undefined;
  youId?: string;
  youKeys?: Set<string>;
}) {
  if (series.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {/* Round header: Oswald caps label + hairline rule */}
      <div className="flex items-center gap-3">
        <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--md-ink)]">
          {label}
        </span>
        <div className="flex-1 border-t border-[var(--md-paper-3)]" />
        <span className="font-mono text-[10px] text-[var(--md-ink-muted)]">
          {series.length} game{series.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="grid w-full gap-3 sm:grid-cols-2">
        {series.map((s, i) => {
          const conf = teamOf(s.hiId)?.conference;
          return (
            <div key={`${s.hiId}-${s.loId}-${i}`} className="flex flex-col gap-1">
              <ConfTag conf={conf} />
              <SeriesCard
                series={s}
                nameOf={nameOf}
                teamOf={teamOf}
                youId={youId}
                youKeys={youKeys}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── HORIZONTAL TREE (desktop lg:+) ──────────────────────────────────────────
//
// Layout: side-by-side columns, one per bracket round + a champion column.
// Within each column, matchup slots are distributed with equal flex spacing so
// each slot vertically centers between its two feeder slots in the prior column.
//
// Connectors: right-side horizontal arm → vertical bar → horizontal arm into
// next round, drawn with absolutely-positioned ink hairline divs.
//
// The whole tree scrolls horizontally inside its overflow-x:auto wrapper if
// the viewport is too narrow (e.g. small desktop < 900px).

// Renders a single matchup slot in the horizontal tree. Each slot occupies an
// equal share of the column height via flex-grow. The card sits in the vertical
// center; the remaining space is split above/below, which is what creates the
// "pairs feeding upward" geometry without any hardcoded pixel math.
function TreeSlot({
  series,
  nameOf,
  teamOf,
  youId,
  youKeys,
  isFinal,
  // Whether to draw connector lines on the right side of this slot.
  // true for all rounds except the final (which feeds into the champion box).
  drawConnectorRight,
  // Whether to draw the incoming connector on the left side.
  // false for the very first column (no feeder).
  drawConnectorLeft,
  // This slot is the TOP of a pair (affects which half of the vertical
  // connector spans downward vs upward).
  isTopOfPair,
}: {
  series: SeriesResult;
  nameOf: (id: string) => string;
  teamOf: (id: string) => BracketTeam | undefined;
  youId?: string;
  youKeys?: Set<string>;
  isFinal?: boolean;
  drawConnectorRight: boolean;
  drawConnectorLeft: boolean;
  isTopOfPair: boolean;
}) {
  return (
    // Each slot: flex-1 so all slots share column height equally.
    // relative so the connector pseudo-lines can be absolutely positioned.
    <div className="relative flex flex-1 flex-col items-stretch justify-center">
      {/* Left incoming connector: horizontal arm from midpoint of the gap between
          two feeder cards to the left edge of this card.
          Only rendered on rounds > 0. The arm is a 1px horizontal line at 50%
          of the slot height, running from left=0 to the card left edge (24px). */}
      {drawConnectorLeft && (
        <div
          className="pointer-events-none absolute"
          style={{
            top: "50%",
            left: 0,
            width: 24,
            height: 1,
            background: "var(--md-ink)",
            transform: "translateY(-0.5px)",
          }}
        />
      )}

      {/* The series card itself, indented by connector arm width on left. */}
      <div style={{ marginLeft: drawConnectorLeft ? 24 : 0, marginRight: drawConnectorRight ? 24 : 0 }}>
        <SeriesCard
          series={series}
          nameOf={nameOf}
          teamOf={teamOf}
          youId={youId}
          youKeys={youKeys}
          isFinal={isFinal}
          compact
        />
      </div>

      {/* Right outgoing connector: horizontal arm + vertical bar.
          The arm runs from the card right edge to the column right edge.
          The vertical bar covers the top half (isTopOfPair) or bottom half
          so the two slots in a pair share a vertical spine at column-right. */}
      {drawConnectorRight && (
        <>
          {/* Horizontal arm to right */}
          <div
            className="pointer-events-none absolute"
            style={{
              top: "50%",
              right: 0,
              width: 24,
              height: 1,
              background: "var(--md-ink)",
              transform: "translateY(-0.5px)",
            }}
          />
          {/* Vertical bar: spans from this slot's center to the pair midpoint.
              Top slot: bar goes DOWN from center to 100% (bottom of slot).
              Bottom slot: bar goes UP from 0% to center. */}
          <div
            className="pointer-events-none absolute"
            style={{
              right: 0,
              width: 1,
              background: "var(--md-ink)",
              top: isTopOfPair ? "50%" : 0,
              bottom: isTopOfPair ? 0 : "50%",
            }}
          />
        </>
      )}
    </div>
  );
}

// One column in the horizontal tree. The column header (QUARTERFINALS etc.) sits
// above, then a flex column of TreeSlots fills the remaining height.
function TreeColumn({
  label,
  isFinalLabel,
  rounds,
  nameOf,
  teamOf,
  youId,
  youKeys,
  isFirst,
  isLast,
  width,
}: {
  label: string;
  isFinalLabel?: boolean;
  rounds: SeriesResult[];
  nameOf: (id: string) => string;
  teamOf: (id: string) => BracketTeam | undefined;
  youId?: string;
  youKeys?: Set<string>;
  isFirst: boolean;
  isLast: boolean;
  width: number;
}) {
  return (
    <div className="flex flex-col" style={{ width, flexShrink: 0 }}>
      {/* Column header */}
      <div className="mb-3 flex items-center gap-2">
        <span
          className="font-cond text-[11px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: isFinalLabel ? "var(--md-coral)" : "var(--md-ink-muted)" }}
        >
          {label}
        </span>
      </div>
      {/* Matchup slots — each gets equal flex share of the column */}
      <div className="flex flex-1 flex-col">
        {rounds.map((s, i) => (
          <TreeSlot
            key={`${s.hiId}-${s.loId}-${i}`}
            series={s}
            nameOf={nameOf}
            teamOf={teamOf}
            youId={youId}
            youKeys={youKeys}
            isFinal={isLast}
            drawConnectorLeft={!isFirst}
            drawConnectorRight={!isLast}
            // Within each round, pairs are indexed: slot 0 is top-of-pair 0,
            // slot 1 is bottom-of-pair 0, slot 2 is top-of-pair 1, etc.
            isTopOfPair={i % 2 === 0}
          />
        ))}
      </div>
    </div>
  );
}

// The champion box: press-yellow card with trophy + name + record.
// Sits in the rightmost column, vertically centered in the full bracket height.
function ChampionColumn({
  championName,
  championId,
  teamOf,
  bracket,
}: {
  championName: string;
  championId: string;
  teamOf: (id: string) => BracketTeam | undefined;
  bracket: BracketResult;
}) {
  // Derive the champion's playoff GAME record (not series): walk every series the
  // champion played in and add their game wins + losses. scoreHi/scoreLo are the
  // game-win counts for hi/lo, so the champion's wins are scoreHi when they're hi
  // (scoreLo when lo) and their losses are the other side.
  let won = 0;
  let lost = 0;
  for (const round of bracket.rounds) {
    for (const s of round) {
      if (s.hiId === championId) {
        won += s.scoreHi;
        lost += s.scoreLo;
      } else if (s.loId === championId) {
        won += s.scoreLo;
        lost += s.scoreHi;
      }
    }
  }
  // "Undefeated" only when the champion dropped ZERO playoff games.
  const record = lost === 0 ? `${won}-0 · Undefeated` : `${won}-${lost} · Ran the table`;
  const isGhost = teamOf(championId)?.isGhost;

  return (
    // Full-height flex column with header + centered champion box
    <div className="flex flex-col" style={{ width: 140, flexShrink: 0 }}>
      {/* Column header */}
      <div className="mb-3">
        <span className="font-cond text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--md-coral)]">
          Champion
        </span>
      </div>
      {/* Champion card — press-yellow, ink border, vertically centered */}
      <div className="flex flex-1 flex-col items-stretch justify-center">
        {/* Left connecting arm from Final column */}
        <div className="relative flex flex-col">
          <div
            className="pointer-events-none absolute"
            style={{
              top: "50%",
              left: 0,
              width: 24,
              height: 1,
              background: "var(--md-ink)",
              transform: "translateY(-0.5px)",
            }}
          />
          <div
            className="flex flex-col gap-2 px-3 py-3"
            style={{
              marginLeft: 24,
              background: "var(--md-yellow)",
              border: "2px solid var(--md-ink)",
              boxShadow: "var(--md-shadow-sm)",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[18px] leading-none">♛</span>
              <span className="font-cond text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--md-ink)]">
                Champion
              </span>
            </div>
            <div
              className="font-archivo leading-tight text-[var(--md-ink)]"
              style={{ fontSize: 15, fontWeight: 800, fontVariationSettings: '"wdth" 100', wordBreak: "break-word" }}
            >
              {isGhost ? "🤖 " : ""}
              {championName}
            </div>
            <div className="font-mono text-[10px] text-[var(--md-ink)]">{record}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HORIZONTAL TREE WRAPPER ─────────────────────────────────────────────────
// Renders all rounds as side-by-side columns. The entire tree sits inside an
// overflow-x:auto container so it scrolls horizontally on small desktops
// without breaking the page layout.

function HorizontalBracketTree({
  bracket,
  youId,
  youKeys,
}: {
  bracket: BracketResult;
  youId?: string;
  youKeys?: Set<string>;
}) {
  const byId = new Map(bracket.teams.map((t) => [t.id, t]));
  const nameOf = (id: string) => byId.get(id)?.name ?? id;
  const teamOf = (id: string) => byId.get(id);

  const rounds = bracket.rounds;
  const numRounds = rounds.length;

  // Column label: derived from distance to final (last round = 0).
  function colLabel(i: number): string {
    return roundLabel(numRounds - 1 - i);
  }

  // Column widths: all rounds get 220px, last round (Final) gets 200px.
  // These are minimum widths; the tree may be wider than the viewport.
  const colWidth = (i: number) => (i === numRounds - 1 ? 200 : 220);

  // Minimum tree height: enough to show all QF matchups without crowding.
  // Each matchup card is ~56px; we want at least 32px gap between cards.
  const qfCount = rounds[0]?.length ?? 1;
  const minTreeHeight = Math.max(320, qfCount * 88);

  return (
    <div className="overflow-x-auto">
      <div
        className="flex gap-0 items-stretch"
        style={{ minWidth: numRounds * 220 + 140, minHeight: minTreeHeight }}
      >
        {rounds.map((series, i) => (
          <TreeColumn
            key={i}
            label={colLabel(i)}
            isFinalLabel={i === numRounds - 1}
            rounds={series}
            nameOf={nameOf}
            teamOf={teamOf}
            youId={youId}
            youKeys={youKeys}
            isFirst={i === 0}
            isLast={i === numRounds - 1}
            width={colWidth(i)}
          />
        ))}
        {/* Champion box */}
        <ChampionColumn
          championName={bracket.championName}
          championId={bracket.championId}
          teamOf={teamOf}
          bracket={bracket}
        />
      </div>
    </div>
  );
}

// ─── MOBILE STACKED VIEW ────────────────────────────────────────────────────
// Unchanged from the original: vertical list of round sections.

function MobileStackedBracket({
  bracket,
  youId,
  youKeys,
}: {
  bracket: BracketResult;
  youId?: string;
  youKeys?: Set<string>;
}) {
  const byId = new Map(bracket.teams.map((t) => [t.id, t]));
  const nameOf = (id: string) => byId.get(id)?.name ?? id;
  const teamOf = (id: string) => byId.get(id);

  const lastIdx = bracket.rounds.length - 1;

  return (
    <div className="flex flex-col gap-6">
      {bracket.rounds.map((series, r) => {
        if (r === lastIdx) {
          if (series.length === 0) return null;
          return (
            <div key="final" className="flex flex-col gap-3">
              {/* Final header */}
              <div className="flex items-center gap-3">
                <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--md-coral)]">
                  {roundLabel(0)}
                </span>
                <div className="flex-1 border-t border-[var(--md-paper-3)]" />
                <span className="font-mono text-[10px] text-[var(--md-ink-muted)]">
                  1 game
                </span>
              </div>
              <div className="w-full max-w-sm">
                {series.map((s, i) => (
                  <SeriesCard
                    key={`final-${i}`}
                    series={s}
                    nameOf={nameOf}
                    teamOf={teamOf}
                    youId={youId}
                    youKeys={youKeys}
                    isFinal
                  />
                ))}
              </div>
              {/* Champion capsule */}
              <div
                className="flex items-center gap-3 px-4 py-3 font-cond"
                style={{ background: "var(--md-yellow)", border: "2px solid var(--md-ink)", boxShadow: "var(--md-shadow-md)" }}
              >
                <span className="text-[20px]">♛</span>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--md-ink)]">
                    Champion
                  </div>
                  <div
                    className="font-archivo leading-tight"
                    style={{ fontSize: 18, fontWeight: 800, fontVariationSettings: '"wdth" 100', color: "var(--md-ink)" }}
                  >
                    {teamOf(bracket.championId)?.isGhost ? "🤖 " : ""}
                    {bracket.championName}
                  </div>
                </div>
              </div>
            </div>
          );
        }
        return (
          <RoundSection
            key={r}
            label={roundLabel(lastIdx - r)}
            series={series}
            nameOf={nameOf}
            teamOf={teamOf}
            youId={youId}
            youKeys={youKeys}
          />
        );
      })}
    </div>
  );
}

// ─── PUBLIC EXPORT ───────────────────────────────────────────────────────────
// Renders the horizontal tree on lg:+ and the stacked view on mobile.
// Props are unchanged from the original component.

export function BracketView({
  bracket,
  youId,
  sharedBoard = false,
}: {
  bracket: BracketResult;
  youId?: string;
  sharedBoard?: boolean;
}) {
  const byId = new Map(bracket.teams.map((t) => [t.id, t]));

  const youKeys = (() => {
    if (!sharedBoard || !youId) return undefined;
    const you = byId.get(youId);
    if (!you) return undefined;
    const roster = [...(you.roster ?? []), ...(you.sixthMan ? [you.sixthMan] : [])];
    return new Set(roster.map(playerKey));
  })();

  return (
    <>
      {/* Mobile: stacked rounds (hidden on lg+) */}
      <div className="lg:hidden">
        <MobileStackedBracket bracket={bracket} youId={youId} youKeys={youKeys} />
      </div>
      {/* Desktop: horizontal tree (hidden below lg) */}
      <div className="hidden lg:block">
        <HorizontalBracketTree bracket={bracket} youId={youId} youKeys={youKeys} />
      </div>
    </>
  );
}
