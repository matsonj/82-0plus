"use client";

// SIMULATE reveal — the game-by-game tournament playback. After "Enter
// Tournament", the result screen shows a flame SIMULATE button; pressing it runs
// a dark "takeover" that reveals each game one at a time (dropping down from the
// previous game, with the W/L chip fading in a beat later), stamps each series
// win, and ends on the gold CHAMPIONS or ink ELIMINATED stamp. Elimination games
// reveal slower for tension. The end card dismisses into the full results page.
//
// All data comes from buildRevealScript (pure). This file owns only timing +
// presentation. Honors prefers-reduced-motion (renders the end state instantly).

import { useEffect, useMemo, useRef, useState } from "react";
import type { TournamentRunResponse, TournamentMode } from "@/lib/types";
import { buildRevealScript, type RevealScript, type RevealRound } from "@/lib/revealPath";
import { Button } from "@/components/ui";

// Per-beat dwell times (ms). Game beats run ~30% quicker than the first pass;
// elimination beats still run slower for tension.
const TIMING = {
  matchup: 700, // matchup on screen, before game 1 drops
  drop: 250, // after a game row lands, before its chip
  chip: 225, // after the chip, before the next game
  dropElim: 615,
  chipElim: 505,
  tensionHold: 750, // WIN OR GO HOME separator appears, before the first elim game drops
  roundWonHold: 1200, // ROUND WON bar dwell, before advancing to the next round
  outcomeHold: 1500, // CHAMPION / ELIMINATED bar dwell, before the end card swipes in
};

// One rendered moment of the playback. The director steps through these.
interface Frame {
  roundIdx: number;
  revealedGames: number; // game rows visible
  chippedGames: number; // rows whose W/L chip has faded in
  end: boolean; // the dismissible end card (swipes in)
  // Once true it STAYS true for the rest of the round: a persistent "WIN OR GO
  // HOME" separator row sits above the elimination games, which stack below it.
  elimSeparator?: boolean;
  // The bottom outcome row of a settled series. Held a beat, then the run either
  // advances to the next round (roundwon) or swipes to the end card.
  outcomeInline?: "roundwon" | "champion" | "eliminated";
  delayAfter: number;
}

function buildFrames(script: RevealScript): Frame[] {
  const frames: Frame[] = [];
  script.rounds.forEach((round, i) => {
    // matchup appears (seeds + records), no games yet
    frames.push({ roundIdx: i, revealedGames: 0, chippedGames: 0, end: false, delayAfter: TIMING.matchup });
    let elim = false;
    round.games.forEach((g, gi) => {
      // the FIRST elimination game inserts the persistent separator above it
      if (g.isElimination && !elim) {
        elim = true;
        frames.push({ roundIdx: i, revealedGames: gi, chippedGames: gi, end: false, elimSeparator: true, delayAfter: TIMING.tensionHold });
      }
      // row drops in (score), then the W/L chip fades in a beat later
      frames.push({ roundIdx: i, revealedGames: gi + 1, chippedGames: gi, end: false, elimSeparator: elim, delayAfter: g.isElimination ? TIMING.dropElim : TIMING.drop });
      frames.push({ roundIdx: i, revealedGames: gi + 1, chippedGames: gi + 1, end: false, elimSeparator: elim, delayAfter: g.isElimination ? TIMING.chipElim : TIMING.chip });
    });
    // bottom outcome row for the settled series, held a beat
    const kind: Frame["outcomeInline"] = !round.youWonSeries
      ? "eliminated"
      : round.isLastRound
        ? "champion"
        : "roundwon";
    frames.push({
      roundIdx: i, revealedGames: round.games.length, chippedGames: round.games.length,
      end: false, elimSeparator: elim, outcomeInline: kind,
      delayAfter: kind === "roundwon" ? TIMING.roundWonHold : TIMING.outcomeHold,
    });
  });
  // terminal: the end card swipes in over the final outcome bar
  const last = Math.max(0, script.rounds.length - 1);
  const lastGames = script.rounds[last]?.games.length ?? 0;
  frames.push({ roundIdx: last, revealedGames: lastGames, chippedGames: lastGames, end: true, delayAfter: 0 });
  return frames;
}

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function kicker(mode?: TournamentMode): string {
  if (mode === "daily") return "Daily Playoffs";
  if (mode === "hoopiq") return "Ranked Playoffs";
  return "Classic Playoffs";
}

// ── shared bits ────────────────────────────────────────────────────────────

function SeedBadge({ seed, you }: { seed: number; you?: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center font-mono text-[11px] font-bold leading-none"
      style={{
        width: 22, height: 22,
        background: you ? "var(--md-cobalt)" : "var(--md-paper-3)",
        color: you ? "var(--md-white)" : "var(--md-ink)",
      }}
    >
      {seed}
    </span>
  );
}

function RoundMeter({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#7a7264]">
        Round {current} / {total}
      </span>
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            style={{
              width: 14, height: 14,
              background: i < current ? "var(--md-cobalt)" : "transparent",
              border: i < current ? "none" : "1.5px solid #4a443b",
              boxSizing: "border-box",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Tale-of-the-tape matchup (re-animates when the round changes).
function Matchup({ round }: { round: RevealRound }) {
  return (
    <div key={round.roundAbsIndex} className="sim-drop-in flex flex-col gap-2.5">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#7a7264]">
        {round.roundName} · Best of {round.bestOf}
      </span>
      <div
        className="flex items-center justify-between gap-2 pl-3"
        style={{ boxShadow: "inset 3px 0 0 0 var(--md-cobalt)" }}
      >
        <div className="flex items-center gap-2">
          <SeedBadge seed={round.you.seed} you />
          <span className="font-archivo text-[17px] font-extrabold text-[var(--md-paper)]" style={{ fontVariationSettings: '"wdth" 100' }}>
            {round.you.name}
          </span>
          <span className="bg-[var(--md-cobalt)] px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] text-[var(--md-white)]">YOU</span>
        </div>
        <span className="font-mono text-[13px] font-bold text-[var(--md-paper)]">{round.you.regW}–{round.you.regL}</span>
      </div>
      <span className="pl-3 font-mono text-[11px] lowercase text-[#7a7264]">vs</span>
      <div className="flex items-center justify-between gap-2 pl-3">
        <div className="flex items-center gap-2">
          <SeedBadge seed={round.opp.seed} />
          <span className="font-archivo text-[17px] font-extrabold text-[var(--md-paper)]" style={{ fontVariationSettings: '"wdth" 100' }}>
            {round.opp.name}
          </span>
        </div>
        <span className="font-mono text-[13px] font-bold text-[#9a9081]">{round.opp.regW}–{round.opp.regL}</span>
      </div>
    </div>
  );
}

function GameRowView({
  round, index, newest, chipped,
}: { round: RevealRound; index: number; newest: boolean; chipped: boolean }) {
  const g = round.games[index];
  return (
    <div
      className={`flex items-center px-2.5 py-2 ${newest ? "sim-drop-in" : ""}`}
      style={{
        background: "var(--md-ink-2)",
        boxShadow: newest ? "inset 3px 0 0 0 var(--md-cobalt)" : undefined,
      }}
    >
      <span className="w-[60px] font-mono text-[12px] text-[#9a9081]">GAME {g.gameNo}</span>
      <span className="flex w-[34px] shrink-0 items-center justify-center">
        {chipped ? (
          <span
            className="sim-chip-in font-mono text-[11px] font-bold leading-none"
            style={{
              background: g.won ? "var(--md-teal)" : "var(--md-coral)",
              color: g.won ? "var(--md-paper)" : "var(--md-white)",
              padding: "2px 8px",
            }}
          >
            {g.won ? "W" : "L"}
          </span>
        ) : (
          <span style={{ width: 20, height: 15, border: "1.5px dashed #4a443b", boxSizing: "border-box" }} />
        )}
      </span>
      <span className="flex-1 text-right font-mono text-[13px] font-bold text-[var(--md-paper)]">
        {g.youScore}–{g.oppScore}
      </span>
    </div>
  );
}

// Persistent separator: appears once when elimination starts and stays put;
// the elimination games stack below it.
function WinOrGoHomeRow() {
  return (
    <div className="sim-drop-in flex items-center justify-center py-2.5" style={{ background: "var(--md-coral)" }}>
      <span className="font-cond text-[13px] font-bold uppercase tracking-[0.2em] text-[var(--md-white)]">⚠ Win or go home</span>
    </div>
  );
}

// The bottom row of a settled series: round won / champion / eliminated. It
// drops in beneath the last game (where the eye already is).
function OutcomeBar({
  kind, round,
}: { kind: "roundwon" | "champion" | "eliminated"; round: RevealRound }) {
  if (kind === "champion") {
    return (
      <div className="sim-drop-in flex items-center justify-center py-3" style={{ background: "var(--md-yellow)" }}>
        <span className="font-cover text-[22px] uppercase tracking-[0.04em] text-[var(--md-ink)]">Champion</span>
      </div>
    );
  }
  if (kind === "eliminated") {
    return (
      <div className="sim-drop-in flex items-center justify-center py-3" style={{ background: "var(--md-ink-2)", boxShadow: "inset 0 0 0 2px var(--md-coral)" }}>
        <span className="font-cover text-[22px] uppercase tracking-[0.04em] text-[var(--md-coral)]">Eliminated</span>
      </div>
    );
  }
  return (
    <div className="sim-drop-in flex items-center justify-center gap-2.5 py-3" style={{ background: "var(--md-ink-2)", boxShadow: "inset 0 0 0 2px var(--md-teal-bright)" }}>
      <span className="font-cover text-[20px] uppercase tracking-[0.04em]" style={{ color: "var(--md-teal-bright)" }}>Round Won</span>
      <span className="font-mono text-[11px] font-bold text-[var(--md-paper)]">{round.seriesW}–{round.seriesL}</span>
    </div>
  );
}

// ── component ───────────────────────────────────────────────────────────────

export function SimulateReveal({
  data, mode, onDismiss,
}: {
  data: TournamentRunResponse;
  mode?: TournamentMode;
  onDismiss: () => void;
}) {
  const script = useMemo(() => buildRevealScript(data.bracket, data.you), [data]);
  const frames = useMemo(() => buildFrames(script), [script]);

  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Director: advance through frames on a timer until the end card.
  useEffect(() => {
    if (!started) return;
    if (reducedMotion()) {
      setIdx(frames.length - 1);
      return;
    }
    if (idx >= frames.length - 1) return;
    timer.current = setTimeout(
      () => setIdx((i) => Math.min(i + 1, frames.length - 1)),
      frames[idx].delayAfter,
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [started, idx, frames]);

  const frame = frames[idx];

  const skip = () => {
    if (timer.current) clearTimeout(timer.current);
    setIdx(frames.length - 1);
  };

  // Panel chrome shared across phases. `below` renders a control row under the
  // dark box (e.g. Skip) so it never collides with the meter or a stamp.
  const panel = (
    children: React.ReactNode,
    extraStyle?: React.CSSProperties,
    below?: React.ReactNode,
  ) => (
    <div className="mx-auto w-full max-w-[520px]">
      <div
        className="relative flex flex-col"
        style={{
          background: "var(--md-ink)",
          boxShadow: "8px 8px 0 0 var(--md-coral)",
          padding: 26,
          minHeight: 480,
          ...extraStyle,
        }}
      >
        {children}
      </div>
      {below && <div className="mt-3 flex justify-center">{below}</div>}
    </div>
  );

  // The game-by-game view for a frame (meter + matchup + series + rows + outcome
  // bar). Used live during the run AND reused as the static base under the end
  // card, so the result swipes in over the exact screen you were just watching.
  const renderRunningView = (f: Frame) => {
    const rnd = script.rounds[f.roundIdx];
    const confirmed = rnd.games.slice(0, f.chippedGames);
    const w = confirmed.filter((g) => g.won).length;
    const l = confirmed.length - w;
    const fe = rnd.games.findIndex((g) => g.isElimination);
    const sp = !!f.elimSeparator && fe >= 0;
    const before = sp ? Math.min(f.revealedGames, fe) : f.revealedGames;
    const after = sp ? Math.max(0, f.revealedGames - fe) : 0;
    const rg = (i: number) => (
      <GameRowView
        key={`${rnd.roundAbsIndex}-${rnd.games[i].gameNo}`}
        round={rnd}
        index={i}
        newest={i === f.revealedGames - 1}
        chipped={i < f.chippedGames}
      />
    );
    return (
      <div className="flex flex-1 flex-col gap-4">
        <RoundMeter total={script.totalRounds} current={rnd.roundAbsIndex + 1} />
        <Matchup round={rnd} />
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#5c564b]">The Series</span>
          <span className="font-mono text-[13px] font-bold" style={{ color: l > w ? "var(--md-coral)" : "var(--md-teal-bright)" }}>{w}–{l}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: before }, (_, i) => rg(i))}
          {sp && <WinOrGoHomeRow key="wogh" />}
          {sp && Array.from({ length: after }, (_, k) => rg(fe + k))}
          {f.outcomeInline && <OutcomeBar kind={f.outcomeInline} round={rnd} />}
        </div>
      </div>
    );
  };
  const tensionStyleFor = (f: Frame): React.CSSProperties | undefined =>
    f.elimSeparator && !f.outcomeInline
      ? { background: "#1a0f0d", boxShadow: "8px 8px 0 0 var(--md-coral), inset 0 0 0 2px var(--md-coral-deep)" }
      : undefined;

  // ── gate (resting) ──
  if (!started) {
    return panel(
      <div className="flex flex-1 flex-col justify-between gap-6">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#7a7264]">{kicker(mode)}</span>
          <span className="font-cover text-[38px] uppercase leading-[0.92] text-[var(--md-paper)]">Your Run<br />Awaits</span>
        </div>
        <div className="flex flex-col items-center gap-3">
          <Button
            size="lg"
            className="flex w-full items-center justify-center gap-2"
            style={{ background: "var(--md-coral)", color: "var(--md-white)", borderColor: "var(--md-paper)", boxShadow: "6px 6px 0 0 var(--md-paper)" }}
            onClick={() => { setStarted(true); setIdx(0); }}
          >
            <span className="font-cover text-[24px] uppercase tracking-[0.04em]">▶ Simulate</span>
          </Button>
          <span className="font-mono text-[12px] text-[#7a7264]">press to run all {script.totalRounds} rounds</span>
        </div>
      </div>,
      { justifyContent: "stretch" },
    );
  }

  // ── end card: swipes in OVER the held final view (which stays put) ──
  if (frame.end) {
    const champion = script.end.kind === "champion";
    const lastRound = script.rounds[script.rounds.length - 1];
    // The frame just before the end card is the held outcome-bar view — render
    // it as the static base so the result card slides over the top of it.
    const baseFrame = frames[Math.max(0, idx - 1)] ?? frame;
    return (
      <div className="relative mx-auto w-full max-w-[520px]">
        <div
          className="relative flex flex-col"
          style={{ background: "var(--md-ink)", boxShadow: "8px 8px 0 0 var(--md-coral)", padding: 26, minHeight: 480 }}
        >
          {renderRunningView(baseFrame)}
        </div>
        <div
          key="swipe"
          className="sim-swipe-in absolute inset-0 flex flex-col items-center"
          style={{ background: "var(--md-ink)", boxShadow: "8px 8px 0 0 var(--md-coral)", padding: 26 }}
        >
          <div className="flex flex-1 flex-col items-center justify-center gap-5 py-4">
            {champion ? (
              <div
                className="flex flex-col items-center justify-center px-7 py-4"
                style={{ rotate: "-5deg", background: "var(--md-yellow)", border: "3px solid var(--md-ink)", boxShadow: "var(--md-magenta) 4px 4px 0px, var(--md-ink) 8px 8px 0px" }}
              >
                <span className="font-cond text-[13px] font-semibold uppercase tracking-[0.2em] text-[var(--md-ink)]">♛ daily82 ♛</span>
                <span className="font-cover text-[46px] uppercase leading-none text-[var(--md-ink)]">Champions</span>
                <span className="font-mono text-[11px] font-bold tracking-[0.06em] text-[var(--md-ink)]">{data.you.name}</span>
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center px-6 py-3.5"
                style={{ rotate: "-8deg", background: "var(--md-ink)", border: "3px solid var(--md-coral)", boxShadow: "var(--md-magenta) 4px 4px 0px, #5c564b 8px 8px 0px" }}
              >
                <span className="font-cover text-[40px] uppercase leading-none text-[var(--md-coral)]">Eliminated</span>
                {lastRound && (
                  <span className="font-mono text-[11px] font-bold tracking-[0.08em] text-[var(--md-paper)]">
                    {lastRound.roundName.toUpperCase()} · LOST {lastRound.seriesW}–{lastRound.seriesL}
                  </span>
                )}
              </div>
            )}
            {script.end.kind === "eliminated" && (
              <span className="font-mono text-[13px] text-[#9a9081]">finished {script.end.finish}</span>
            )}
          </div>
          <Button
            size="lg"
            className="w-full"
            style={{ background: "var(--md-coral)", color: "var(--md-white)", borderColor: "var(--md-paper)", boxShadow: "5px 5px 0 0 var(--md-paper)" }}
            onClick={onDismiss}
          >
            See full results
          </Button>
        </div>
      </div>
    );
  }

  // ── running (matchup + game-by-game) ──
  return panel(
    renderRunningView(frame),
    tensionStyleFor(frame),
    <button
      key="skip"
      type="button"
      onClick={skip}
      className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--md-ink-muted)]"
      style={{ cursor: "pointer" }}
    >
      Skip ▸
    </button>,
  );
}
