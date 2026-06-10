"use client";

import { useState } from "react";
import { regWinsFromSeedNet } from "@/lib/tier";
import type {
  BracketResult,
  BracketTeam,
  BracketPlayer,
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
        className={`mb-1 truncate font-display text-[11px] ${
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
  const hb = game.breakdown?.[game.homeId];
  const ab = game.breakdown?.[game.awayId];
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
        <span className="shrink-0 font-display text-[12px] font-bold tabular-nums">
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
// multiple teams (everyone draws the same daily board, so overlap is expected).
const playerKey = (p: BracketPlayer) => `${p.name}|${p.team}|${p.season}`;

// One player row in a roster panel: name + subtle "team 'season", captain chip.
// `shared` greys + italicises a player YOU also drafted (daily mode), so this
// team's picks that differ from yours read bold at a glance.
function PlayerRow({ p, shared }: { p: BracketPlayer; shared?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 font-display text-[11px]">
      <span
        // pr-1 on italic: `truncate` clips overflow, and the slanted final glyph
        // (e.g. the "d" in Leonard/Reed) overhangs its box — the padding gives it room.
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
      <span className="shrink-0 text-[10px] text-[var(--md-orange-deep)]">
        {p.team} &rsquo;{String(p.season).slice(2)}
      </span>
    </div>
  );
}

// The expandable roster panel for one team: five starters, a divider, sixth man.
// Degrades gracefully when the stored bracket predates the roster fields.
function RosterPanel({
  team,
  compareKeys,
}: {
  team: BracketTeam | undefined;
  // The viewer's roster keys to grey out on THIS team (a shared pick). Undefined
  // for the viewer's own team (or non-daily / public view) → nothing greyed.
  compareKeys?: Set<string>;
}) {
  if (!team || team.roster === undefined) {
    return (
      <div className="border-t-2 border-dashed border-[var(--md-ink)] bg-[var(--md-paper)] px-2 py-1.5 font-display text-[10px] italic text-[var(--md-ink-muted)]">
        roster unavailable
      </div>
    );
  }
  const isShared = (p: BracketPlayer) => compareKeys?.has(playerKey(p)) ?? false;
  return (
    <div className="border-t-2 border-dashed border-[var(--md-ink)] bg-[var(--md-paper)] px-2 py-1.5">
      {team.roster.map((p, i) => (
        <PlayerRow key={`${p.team}-${p.name}-${i}`} p={p} shared={isShared(p)} />
      ))}
      {team.sixthMan && (
        <>
          <div className="my-1 border-t-2 border-[var(--md-ink)]" />
          <div className="font-display text-[8px] font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            Sixth Man
          </div>
          <PlayerRow p={team.sixthMan} shared={isShared(team.sixthMan)} />
        </>
      )}
    </div>
  );
}

// One side of a series card: seed badge + name (a roster toggle) + score,
// winner bold / loser muted. The name button toggles `this` team's roster panel.
function SeriesSide({
  team,
  name,
  isWinner,
  isYou,
  score,
  open,
  onToggle,
}: {
  team: BracketTeam | undefined;
  name: string;
  isWinner: boolean;
  isYou: boolean;
  score: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 ${
        isWinner ? "" : "opacity-60"
      }`}
      // Highlight only YOUR row (not the whole card).
      style={isYou ? { background: "var(--md-yellow)" } : undefined}
    >
      <SeedBadge seed={team?.seed} />
      <button
        type="button"
        onClick={onToggle}
        className={`min-w-0 flex-1 truncate text-left font-display text-[12px] sm:text-[13px] ${
          isWinner ? "font-bold" : ""
        }`}
        style={{ cursor: "pointer" }}
        aria-expanded={open}
      >
        {/* Ghost (AI filler) teams are prefixed with 🤖 so users can tell them
            apart from real human submissions. Human teams render no emoji. */}
        {team?.isGhost ? "🤖 " : ""}
        {name}
        {isYou ? " ★" : ""}
        <span className="ml-1 text-[9px] text-[var(--md-ink-muted)]">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {/* Regular-season record (projected from the team's net rating). */}
      {team && (
        <span className="shrink-0 font-display text-[10px] tabular-nums text-[var(--md-ink-muted)]">
          {regWinsFromSeedNet(team.seedNet)}&ndash;{82 - regWinsFromSeedNet(team.seedNet)}
        </span>
      )}
      <span
        className={`w-4 shrink-0 text-right font-display text-[14px] tabular-nums ${
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
  youKeys,
  isFinal = false,
}: {
  series: SeriesResult;
  nameOf: (id: string) => string;
  teamOf: (id: string) => BracketTeam | undefined;
  youId?: string;
  youKeys?: Set<string>;
  isFinal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Which team's roster panel is expanded (the name-click toggle), if any.
  const [rosterOpen, setRosterOpen] = useState<"hi" | "lo" | null>(null);
  const hiWon = series.winnerId === series.hiId;
  const involvesYou =
    youId !== undefined && (series.hiId === youId || series.loId === youId);
  const hiTeam = teamOf(series.hiId);
  const loTeam = teamOf(series.loId);
  // Grey the viewer's shared picks on OPPONENTS only — never on the viewer's team.
  const compareFor = (id: string) => (id === youId ? undefined : youKeys);
  const toggleRoster = (side: "hi" | "lo") =>
    setRosterOpen((cur) => (cur === side ? null : side));

  return (
    <div
      className={`md-card ${involvesYou || isFinal ? "md-card--lift" : ""}`}
      style={{ background: "var(--md-white)" }}
    >
      {/* The matchup — higher seed on top. Each name toggles its roster panel. */}
      <div className="divide-y divide-[var(--md-paper-3)]">
        <SeriesSide
          team={hiTeam}
          name={nameOf(series.hiId)}
          isWinner={hiWon}
          isYou={series.hiId === youId}
          score={series.scoreHi}
          open={rosterOpen === "hi"}
          onToggle={() => toggleRoster("hi")}
        />
        {rosterOpen === "hi" && (
          <RosterPanel team={hiTeam} compareKeys={compareFor(series.hiId)} />
        )}
        <SeriesSide
          team={loTeam}
          name={nameOf(series.loId)}
          isWinner={!hiWon}
          isYou={series.loId === youId}
          score={series.scoreLo}
          open={rosterOpen === "lo"}
          onToggle={() => toggleRoster("lo")}
        />
        {rosterOpen === "lo" && (
          <RosterPanel team={loTeam} compareKeys={compareFor(series.loId)} />
        )}
      </div>

      {/* Series format + per-game scores. Click the footer to reveal each game's
          box score. With NEXT_PUBLIC_DEBUG=1 the games also carry the per-game
          "WHY" modifier breakdown (otherwise it's stripped server-side, so this
          shows scores only in normal play). */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border-t-2 border-[var(--md-ink)] px-2 py-1 text-left font-display text-[9px] uppercase tracking-wide text-[var(--md-ink-muted)]"
        style={{ cursor: "pointer" }}
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

// A small conference tag shown on each non-final series so East/West stay
// readable when both flow through the same responsive grid.
function ConfTag({ conf }: { conf?: string }) {
  if (!conf) return null;
  return (
    <span
      className={`md-capsule ${conf === "West" ? "md-capsule--sky" : "md-capsule--coral"} px-1.5 py-0.5 text-[8px]`}
    >
      {conf}
    </span>
  );
}

// One full round, rendered as its own bounded section: a centered capsule
// header with a dashed divider above (mirrors the Final treatment), then the
// round's series in a responsive grid. East & West series flow together.
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
    <div className="flex flex-col items-center gap-3 border-t-2 border-dashed border-[var(--md-paper-3)] pt-5">
      <div className="md-capsule">{label}</div>
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

export function BracketView({
  bracket,
  youId,
  sharedBoard = false,
}: {
  bracket: BracketResult;
  youId?: string;
  // SHARED-board fields (daily AND private tournaments) all draft from the same
  // pool, so roster overlap is expected. When this is set AND we know which team
  // is "you", an OPPONENT's players that you ALSO drafted render greyed/italic — so
  // the picks that team made *differently* from you (the bold ones) stand out. Your
  // own team is never greyed. (Off for classic/ranked, where boards are unique.)
  sharedBoard?: boolean;
}) {
  const byId = new Map(bracket.teams.map((t) => [t.id, t]));
  const nameOf = (id: string) => byId.get(id)?.name ?? id;
  const teamOf = (id: string) => byId.get(id);

  // The viewer's own roster keys — the set we compare opponents against. Only for
  // a shared board with a known "you"; otherwise undefined → nothing is greyed.
  const youKeys = (() => {
    if (!sharedBoard || !youId) return undefined;
    const you = byId.get(youId);
    if (!you) return undefined;
    const roster = [...(you.roster ?? []), ...(you.sixthMan ? [you.sixthMan] : [])];
    return new Set(roster.map(playerKey));
  })();

  // rounds: [R1 (8), Semis (4), Conf Finals (2), Final (1)]. We render each
  // round as its own stacked section, top to bottom; the Final is its own
  // narrower centered section with the champion capsule beneath.
  const lastIdx = bracket.rounds.length - 1;

  return (
    <div className="flex flex-col gap-6">
      {bracket.rounds.map((series, r) => {
        // The Final gets bespoke centered/narrow treatment + champion capsule.
        if (r === lastIdx) {
          if (series.length === 0) return null;
          return (
            <div
              key="final"
              className="flex flex-col items-center gap-3 border-t-2 border-dashed border-[var(--md-paper-3)] pt-5"
            >
              <div className="md-capsule md-capsule--coral">
                {ROUND_LABEL[3]}
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
              <div className="md-capsule md-capsule--teal">
                {/* championName is a bare string here, so look the champion team
                    up by championId to recover its isGhost flag and prefix 🤖. */}
                🏆 {teamOf(bracket.championId)?.isGhost ? "🤖 " : ""}
                {bracket.championName}
              </div>
            </div>
          );
        }
        return (
          <RoundSection
            key={r}
            label={ROUND_LABEL[r] ?? `Round ${r + 1}`}
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
