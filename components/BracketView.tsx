"use client";

import { useState, type ReactNode } from "react";
import type {
  BracketResult,
  BracketTeam,
  BracketPlayer,
  SeriesResult,
  GameResult,
  GameBreakdown,
  PlayInResult,
} from "@/lib/types";
import { playInEarnedSeeds } from "@/lib/tournamentLabels";

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
// GDU-0 treatment: a compact two-row card. The WINNER row is a filled bar —
// ink (or cobalt when it's the viewer) with a white name and a flame-red score;
// the LOSER row sits on the card field, muted. A "BEST OF N / SEE SCORES" rail
// expands the per-game lines. When the viewer is in the matchup the whole card
// is traced in cobalt (border + offset shadow).
// NOTE: scoreHi/scoreLo are game-win counts (not best-of-7 series wins).

// East = process-blue, West = court-green. Used for the size-20 play-in seed
// badge that ties the resolved 7/8 seeds back to the play-in section below.
function confSeedColor(conf?: string): string {
  return conf === "West" ? "var(--md-teal)" : "var(--md-blue)";
}

// The viewer's own team is marked with a light translucent cobalt fill on just
// its team row (never the whole matchup box) plus a ★.
const YOUR_FILL = "color-mix(in srgb, var(--md-cobalt) 14%, transparent)";

// The seed marker at the left of a team row. Normally a plain centered numeral in
// a fixed lane; for a size-20 play-in survivor it becomes a filled conference-
// color circle with a white number (matching the play-in mini-brackets below).
function SeedBadge({
  seed,
  circleColor,
  won,
}: {
  seed?: number;
  circleColor?: string;
  won: boolean;
}) {
  if (seed === undefined) return <span className="shrink-0" style={{ width: 18 }} />;
  if (circleColor) {
    return (
      <span
        className="flex shrink-0 items-center justify-center font-mono font-bold tabular-nums"
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          background: circleColor,
          color: "var(--md-white)",
          fontSize: 10,
        }}
      >
        {seed}
      </span>
    );
  }
  return (
    <span
      className="shrink-0 text-center font-mono text-[11px] font-bold leading-none tabular-nums"
      style={{ width: 18, color: won ? "var(--md-ink)" : "var(--md-ink-muted)" }}
    >
      {seed}
    </span>
  );
}

// One team row inside a series card. Winner = ink-bold name + coral game-count;
// loser is muted. The viewer (`isYou`) is tinted cobalt (the whole card is also
// cobalt-traced). No filled bar — the card stays light.
function SeriesTeamRow({
  seed,
  name,
  score,
  won,
  isYou,
  isGhost,
  rosterOpen,
  onToggleRoster,
  py,
  nameSize,
  scoreWidth,
  circleColor,
}: {
  seed?: number;
  name: string;
  score: string;
  won: boolean;
  isYou: boolean;
  isGhost?: boolean;
  rosterOpen: boolean;
  onToggleRoster: () => void;
  py: string;
  nameSize: string;
  scoreWidth: number;
  circleColor?: string;
}) {
  const nameColor = won ? "var(--md-ink)" : "var(--md-ink-muted)";
  const scoreColor = won ? "var(--md-coral)" : "var(--md-ink-muted)";

  return (
    <div
      className={`flex items-center gap-2 px-3 ${py}`}
      style={isYou ? { background: YOUR_FILL } : undefined}
    >
      <SeedBadge seed={seed} circleColor={circleColor} won={won} />
      <button
        type="button"
        onClick={onToggleRoster}
        className="min-w-0 flex-1 truncate text-left"
        aria-expanded={rosterOpen}
        style={{ cursor: "pointer" }}
      >
        <span
          className={`font-cond ${nameSize} uppercase tracking-[0.02em]`}
          style={{ fontWeight: won ? 700 : 500, color: nameColor }}
        >
          {isGhost ? "🤖 " : ""}
          {name}
          {isYou ? " ★" : ""}
        </span>
      </button>
      <span
        className="shrink-0 text-right font-mono text-[12px] font-bold tabular-nums"
        style={{ color: scoreColor, minWidth: scoreWidth }}
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
  youKeys,
  isFinal = false,
  compact = false,
  size,
}: {
  series: SeriesResult;
  nameOf: (id: string) => string;
  teamOf: (id: string) => BracketTeam | undefined;
  youId?: string;
  youKeys?: Set<string>;
  isFinal?: boolean;
  compact?: boolean;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState<"hi" | "lo" | null>(null);
  const hiWon = series.winnerId === series.hiId;
  const hiTeam = teamOf(series.hiId);
  const loTeam = teamOf(series.loId);
  const compareFor = (id: string) => (id === youId ? undefined : youKeys);
  const toggleRoster = (side: "hi" | "lo") =>
    setRosterOpen((cur) => (cur === side ? null : side));

  const hiIsYou = series.hiId === youId;
  const loIsYou = series.loId === youId;

  // Per-row game-win count (scoreHi/scoreLo); the winner's is shown in coral.
  const hiScore = String(series.scoreHi);
  const loScore = String(series.scoreLo);
  // Size-20 play-in survivors (resolved 7 & 8 seeds) get a conference-color seed
  // circle, tying them to the play-in mini-brackets below.
  const circleFor = (t?: BracketTeam) =>
    size === 20 && t && (t.seed === 7 || t.seed === 8) && !t.lostPlayIn
      ? confSeedColor(t.conference)
      : undefined;

  const py = compact ? "py-1.5" : "py-2";
  const nameSize = compact ? "text-[14px]" : "text-[14px] sm:text-[15px]";
  // Scores are a single game-win count now, so the lane can be tight — more room
  // for the name.
  const scoreWidth = compact ? 24 : 30;

  // Every card keeps the ink border; the viewer is marked on their own row (fill),
  // not on the box. Only the final gets a subtle lift.
  const shadow = isFinal ? "var(--md-shadow-sm)" : undefined;

  return (
    <div
      className="flex flex-col"
      style={{
        background: "var(--md-white)",
        border: "2px solid var(--md-ink)",
        boxShadow: shadow,
      }}
    >
      {/* Hi team row */}
      <SeriesTeamRow
        seed={hiTeam?.seed}
        name={nameOf(series.hiId)}
        score={hiScore}
        circleColor={circleFor(hiTeam)}
        won={hiWon}
        isYou={hiIsYou}
        isGhost={hiTeam?.isGhost}
        rosterOpen={rosterOpen === "hi"}
        onToggleRoster={() => toggleRoster("hi")}
        py={py}
        nameSize={nameSize}
        scoreWidth={scoreWidth}
      />
      {rosterOpen === "hi" && (
        <RosterPanel team={hiTeam} compareKeys={compareFor(series.hiId)} />
      )}

      {/* Hairline between the two team rows */}
      <div className="h-px" style={{ background: "var(--md-paper-3)" }} />

      {/* Lo team row */}
      <SeriesTeamRow
        seed={loTeam?.seed}
        name={nameOf(series.loId)}
        score={loScore}
        circleColor={circleFor(loTeam)}
        won={!hiWon}
        isYou={loIsYou}
        isGhost={loTeam?.isGhost}
        rosterOpen={rosterOpen === "lo"}
        onToggleRoster={() => toggleRoster("lo")}
        py={py}
        nameSize={nameSize}
        scoreWidth={scoreWidth}
      />
      {rosterOpen === "lo" && (
        <RosterPanel team={loTeam} compareKeys={compareFor(series.loId)} />
      )}

      {/* Subtle per-game scores toggle — a thin hairline strip that reveals the
          box scores on click (kept minimal so the card stays compact). */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-end gap-1 border-t border-[var(--md-paper-3)] px-3 py-0.5 font-cond text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--md-ink-muted)]"
        style={{ cursor: "pointer" }}
        aria-expanded={open}
      >
        <span>{open ? "hide scores" : "scores"}</span>
        <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-[var(--md-paper-3)] bg-[var(--md-paper)] p-2">
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
  size,
}: {
  label: string;
  series: SeriesResult[];
  nameOf: (id: string) => string;
  teamOf: (id: string) => BracketTeam | undefined;
  youId?: string;
  youKeys?: Set<string>;
  size?: number;
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
                size={size}
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
  size,
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
  size?: number;
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
          size={size}
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
  size,
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
  size?: number;
}) {
  return (
    <div className="flex flex-col" style={{ width, flexShrink: 0 }}>
      {/* Column header — ink for the early rounds, flame for FINAL (GDU-0). */}
      <div className="mb-3 flex items-center gap-2">
        <span
          className="font-cond text-[14px] font-bold uppercase tracking-[0.16em]"
          style={{ color: isFinalLabel ? "var(--md-coral)" : "var(--md-ink)" }}
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
            size={size}
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

// The champion box: a single compact press-yellow row — crown + name — sized
// like the bracket's other boxes. The column header already says CHAMPION, so
// there's no inner label, record, or verdict here.
function ChampionColumn({
  championName,
  championId,
  teamOf,
}: {
  championName: string;
  championId: string;
  teamOf: (id: string) => BracketTeam | undefined;
}) {
  const isGhost = teamOf(championId)?.isGhost;

  return (
    // Full-height flex column with header + centered champion terminus
    <div className="flex flex-col" style={{ width: 200, flexShrink: 0 }}>
      {/* Column header — flame, matches FINAL */}
      <div className="mb-3">
        <span className="font-cond text-[14px] font-bold uppercase tracking-[0.16em] text-[var(--md-coral)]">
          Champion
        </span>
      </div>
      {/* Champion terminus — a single compact gold row (crown + name), vertically
          centered and fed by the flame arm from the Final. */}
      <div className="flex flex-1 flex-col items-stretch justify-center">
        <div className="relative flex flex-col">
          <div
            className="pointer-events-none absolute"
            style={{
              top: "50%",
              left: 0,
              width: 24,
              height: 2,
              background: "var(--md-coral)",
              transform: "translateY(-1px)",
            }}
          />
          <div
            className="flex items-center gap-2.5 px-3 py-3"
            style={{
              marginLeft: 24,
              background: "var(--md-yellow)",
              boxShadow: "var(--md-shadow-sm)",
            }}
          >
            {/* Crown */}
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              style={{ flexShrink: 0 }}
              aria-hidden="true"
            >
              <path d="M3 7L7 11L12 4L17 11L21 7L19.5 19H4.5L3 7Z" fill="var(--md-ink)" />
              <rect x="4.5" y="19.5" width="15" height="2.2" fill="var(--md-ink)" />
            </svg>
            <span className="min-w-0 truncate font-cond text-[16px] font-bold uppercase tracking-[0.03em] text-[var(--md-ink)]">
              {isGhost ? "🤖 " : ""}
              {championName}
            </span>
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
  // Apply earned play-in seeds so survivors show their earned 7/8 (not the stored
  // reg-season seed) even on brackets stored before the engine wrote it back.
  const earned = playInEarnedSeeds(bracket);
  const byId = new Map(
    bracket.teams.map(
      (t) => [t.id, earned.has(t.id) ? { ...t, seed: earned.get(t.id)! } : t] as const,
    ),
  );
  const nameOf = (id: string) => byId.get(id)?.name ?? id;
  const teamOf = (id: string) => byId.get(id);

  const rounds = bracket.rounds;
  const numRounds = rounds.length;

  // Column label: derived from distance to final (last round = 0).
  function colLabel(i: number): string {
    return roundLabel(numRounds - 1 - i);
  }

  // Cards are a fixed width so names fit without truncation; each column is that
  // width plus a connector arm on whichever sides have connectors. The card
  // itself always renders at CARD_W regardless of column.
  const ARM = 24;
  const CARD_W = 240;
  const colWidth = (i: number) =>
    CARD_W + (i > 0 ? ARM : 0) + (i < numRounds - 1 ? ARM : 0);

  // Minimum tree height: enough vertical air for a ~66px 2-row card plus a clean
  // gap between each. Grows on demand when a roster is expanded.
  const qfCount = rounds[0]?.length ?? 1;
  const minTreeHeight = Math.max(360, qfCount * 96);
  const treeMinWidth =
    rounds.reduce((sum, _s, i) => sum + colWidth(i), 0) + 210; // + champion col

  return (
    <div className="overflow-x-auto">
      <div
        className="flex gap-0 items-stretch"
        style={{ minWidth: treeMinWidth, minHeight: minTreeHeight }}
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
            size={bracket.size}
          />
        ))}
        {/* Champion box */}
        <ChampionColumn
          championName={bracket.championName}
          championId={bracket.championId}
          teamOf={teamOf}
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
  const earned = playInEarnedSeeds(bracket);
  const byId = new Map(
    bracket.teams.map(
      (t) => [t.id, earned.has(t.id) ? { ...t, seed: earned.get(t.id)! } : t] as const,
    ),
  );
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
                    size={bracket.size}
                  />
                ))}
              </div>
              {/* Champion terminus — gold card, crown + name + verdict */}
              <div
                className="flex items-center gap-4 px-4 py-4"
                style={{ background: "var(--md-yellow)", boxShadow: "var(--md-shadow-md)" }}
              >
                <svg
                  width="34"
                  height="34"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ flexShrink: 0 }}
                  aria-hidden="true"
                >
                  <path d="M3 7L7 11L12 4L17 11L21 7L19.5 19H4.5L3 7Z" fill="var(--md-ink)" />
                  <rect x="4.5" y="19.5" width="15" height="2.2" fill="var(--md-ink)" />
                </svg>
                <div className="min-w-0">
                  <div className="font-cond text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--md-ink)]">
                    Champion
                  </div>
                  <div
                    className="font-cover uppercase leading-none text-[var(--md-ink)]"
                    style={{ fontSize: 28, letterSpacing: "0.005em", wordBreak: "break-word" }}
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
            size={bracket.size}
          />
        );
      })}
    </div>
  );
}

// ─── PLAY-IN (size-20 only) ─────────────────────────────────────────────────
//
// The NBA-style play-in for seeds 7–10, rendered as two per-conference mini-
// brackets below the main tree. Each conference has three single games:
//   A (7v8)   winner → clinches the 7 seed (blue/green stamp), advances
//   B (9v10)  winner → advances to the decider; loser eliminated (seed 10)
//   C (decider: A-loser vs B-winner) winner → clinches the 8 seed, advances;
//             loser eliminated (seed 9)
// Advancers carry a conference-color seed stamp that ties them back to the 7/8
// seed circles in the bracket above. Eliminated names are struck through; the
// A-loser (who drops to the decider, not out) is merely muted.

type PlayInRowState = {
  name: string;
  isGhost?: boolean;
  won: boolean; // won this game → ink-bold; otherwise muted
  eliminated: boolean; // knocked out → strike-through
  isYou: boolean;
  score: string; // this team's box score in the single play-in game
};

function PlayInTeamRow({ row }: { row: PlayInRowState }) {
  const nameColor = row.won ? "var(--md-ink)" : "var(--md-ink-muted)";
  const scoreColor = row.won ? "var(--md-coral)" : "var(--md-ink-muted)";
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5"
      style={row.isYou ? { background: YOUR_FILL } : undefined}
    >
      <span
        className={`min-w-0 flex-1 truncate font-cond text-[13px] uppercase tracking-[0.02em] ${row.eliminated ? "line-through" : ""}`}
        style={{ fontWeight: row.won ? 700 : 500, color: nameColor }}
      >
        {row.isGhost ? "🤖 " : ""}
        {row.name}
        {row.isYou ? " ★" : ""}
      </span>
      <span
        className="shrink-0 text-right font-mono text-[12px] font-bold tabular-nums"
        style={{ color: scoreColor, minWidth: 28 }}
      >
        {row.score}
      </span>
    </div>
  );
}

// A play-in card. The seed it seats (7 for the 7v8 game, 8 for the decider) is a
// conference-color corner stamp — on top of the box, not inside a row.
function PlayInCard({
  label,
  hi,
  lo,
  stampSeed,
  stampColor,
}: {
  label: string;
  hi: PlayInRowState;
  lo: PlayInRowState;
  stampSeed?: number;
  stampColor?: string;
}) {
  return (
    <div
      className="relative flex flex-col"
      style={{ background: "var(--md-white)", border: "2px solid var(--md-ink)" }}
    >
      {stampSeed !== undefined && stampColor && (
        <span
          className="absolute flex items-center justify-center font-mono font-bold tabular-nums"
          style={{
            top: -10,
            right: -10,
            width: 22,
            height: 22,
            borderRadius: 999,
            background: stampColor,
            color: "var(--md-white)",
            fontSize: 11,
            border: "2px solid var(--md-white)",
            zIndex: 2,
          }}
        >
          {stampSeed}
        </span>
      )}
      <div className="border-b border-[var(--md-paper-3)] px-3 py-1 font-cond text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
        {label}
      </div>
      <PlayInTeamRow row={hi} />
      <div className="h-px" style={{ background: "var(--md-paper-3)" }} />
      <PlayInTeamRow row={lo} />
    </div>
  );
}

// A single feeder slot (game A or B) with a right connector arm + half-spine, so
// the two feeders join a vertical spine that feeds the decider — same geometry as
// the main tree's TreeSlot.
function PlayInFeederSlot({
  children,
  isTop,
}: {
  children: ReactNode;
  isTop: boolean;
}) {
  return (
    <div className="relative flex flex-1 flex-col items-stretch justify-center">
      <div style={{ marginRight: 24 }}>{children}</div>
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
      <div
        className="pointer-events-none absolute"
        style={{
          right: 0,
          width: 1,
          background: "var(--md-ink)",
          top: isTop ? "50%" : 0,
          bottom: isTop ? 0 : "50%",
        }}
      />
    </div>
  );
}

// One conference's play-in mini-bracket: [A over B] feeders → C decider.
function PlayInMiniBracket({
  a,
  b,
  c,
  confColor,
  nameOf,
  teamOf,
  youId,
}: {
  a: PlayInResult;
  b: PlayInResult;
  c: PlayInResult;
  confColor: string;
  nameOf: (id: string) => string;
  teamOf: (id: string) => BracketTeam | undefined;
  youId?: string;
}) {
  const scoreOf = (g: GameResult, id: string) =>
    id === g.homeId ? g.homeScore : g.awayScore;
  const row = (
    game: PlayInResult,
    id: string,
    won: boolean,
    eliminated: boolean,
  ): PlayInRowState => ({
    name: nameOf(id),
    isGhost: teamOf(id)?.isGhost,
    won,
    eliminated,
    isYou: id === youId,
    score: String(scoreOf(game.game, id)),
  });

  // Same tile width as the main bracket cards.
  const CARD_W = 240;

  return (
    <div className="flex" style={{ minHeight: 200 }}>
      {/* Feeders: A over B */}
      <div className="flex flex-col" style={{ width: CARD_W + 24 }}>
        <PlayInFeederSlot isTop>
          <PlayInCard
            label="Seeds 7 – 8"
            stampSeed={7}
            stampColor={confColor}
            hi={row(a, a.hiId, a.winnerId === a.hiId, false)}
            lo={row(a, a.loId, a.winnerId === a.loId, false)}
          />
        </PlayInFeederSlot>
        <PlayInFeederSlot isTop={false}>
          <PlayInCard
            label="Seeds 9 – 10"
            hi={row(b, b.hiId, b.winnerId === b.hiId, b.winnerId !== b.hiId)}
            lo={row(b, b.loId, b.winnerId === b.loId, b.winnerId !== b.loId)}
          />
        </PlayInFeederSlot>
      </div>
      {/* Decider */}
      <div className="flex flex-col" style={{ width: CARD_W + 24 }}>
        <div className="relative flex flex-1 flex-col items-stretch justify-center">
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
          <div style={{ marginLeft: 24 }}>
            <PlayInCard
              label="8-Seed Game"
              stampSeed={8}
              stampColor={confColor}
              hi={row(c, c.hiId, c.winnerId === c.hiId, c.winnerId !== c.hiId)}
              lo={row(c, c.loId, c.winnerId === c.loId, c.winnerId !== c.loId)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// The full play-in section: a header rule + both conferences' mini-brackets.
// No East/West labels (the conference-color stamps carry the tie-in). Stacked on
// mobile, side by side on desktop.
function PlayInSection({
  bracket,
  youId,
}: {
  bracket: BracketResult;
  youId?: string;
}) {
  const playIn = bracket.playIn ?? [];
  if (playIn.length === 0) return null;

  const byId = new Map(bracket.teams.map((t) => [t.id, t]));
  const nameOf = (id: string) => byId.get(id)?.name ?? id;
  const teamOf = (id: string) => byId.get(id);

  // Group by conference; within a conference, A = the 7v8 game (forSeed 7), then
  // the two forSeed-8 games in push order: [feeder (9v10), decider].
  const confs = Array.from(new Set(playIn.map((p) => p.conference)));
  const groups = confs
    .map((conf) => {
      const games = playIn.filter((p) => p.conference === conf);
      const a = games.find((g) => g.forSeed === 7);
      const eights = games.filter((g) => g.forSeed === 8);
      const [b, c] = eights;
      return a && b && c
        ? { conf, a, b, c, color: confSeedColor(conf) }
        : null;
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);

  if (groups.length === 0) return null;

  return (
    <div className="mt-8 flex flex-col gap-4">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <span className="font-cond text-[13px] font-bold uppercase tracking-[0.16em] text-[var(--md-ink)]">
          Play-In — Seeds 7 thru 10
        </span>
        <div className="flex-1 border-t border-[var(--md-paper-3)]" />
      </div>
      {/* Conferences: stacked on mobile, side by side + centered on desktop */}
      <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start lg:justify-center lg:gap-14">
        {groups.map((g) => (
          <PlayInMiniBracket
            key={g.conf}
            a={g.a}
            b={g.b}
            c={g.c}
            confColor={g.color}
            nameOf={nameOf}
            teamOf={teamOf}
            youId={youId}
          />
        ))}
      </div>
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
      {/* Size-20 play-in — below the tree, shared by both layouts */}
      {bracket.size === 20 && (bracket.playIn?.length ?? 0) > 0 && (
        <PlayInSection bracket={bracket} youId={youId} />
      )}
    </>
  );
}
