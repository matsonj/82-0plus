"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DailySignIn } from "@/components/DailySignIn";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { getSavedUser } from "@/lib/tournamentSession";
import { normalizeName } from "@/lib/tournamentValidation";
import { pickKey, decadeLabel, gqDiffView, slotWinner } from "@/lib/rosterCompare";
import { SITE_URL } from "@/lib/site";
import { presentShare } from "@/lib/shareActions";
import type { DailyResult } from "@/lib/dailyResults";
import type { TournamentLookupResponse } from "@/lib/types";

function prettyDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// "Jun 22" (no year) for the folio dateline
function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${d}`;
}

const sign = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;

// reachedRound: 0 = lost R1 … 4 = champion.
function tournPhrase(round: number): string {
  return (
    ["Lost R1", "Lost Conf. Semis", "Lost Conf. Finals", "Lost the Final", "🏆 Champion"][
      round
    ] ?? "Eliminated"
  );
}

/** A tournament/bracket run for this daily date. */
interface TournRun {
  recordW: number;
  recordL: number;
  realizedMargin: number;
  reachedRound: number;
}

/** One of the sharer's five picks, carried in the link for a roster compare. */
export interface SharerPick {
  name: string;
  team: string;
  season: number;
  gq: number;
}

/** Sharer's redacted result carried in the link. */
export interface Sharer {
  name: string;
  wins: number;
  losses: number;
  margin: number;
  perfect: boolean;
  // The sharer's tournament run, if the link carried one (added at share time).
  tournament?: TournRun | null;
  // The sharer's five picks, when the link carried them (order is the stored
  // display order, not significant — RosterVersus matches by team). Empty on
  // older links → the roster compare falls back to the viewer's picks only.
  roster: SharerPick[];
}

type State =
  | { kind: "signin" }
  | { kind: "loading" }
  | { kind: "play" } // signed in, hasn't done this day
  | { kind: "result"; you: DailyResult; tournament: TournRun | null }
  | { kind: "error" };

export function DailyShareLanding({
  date,
  sharer,
}: {
  date: string;
  sharer: Sharer | null;
}) {
  // Start in a deterministic state for SSR: reading getSavedUser() (localStorage)
  // in the initializer would diverge between server (always null → "signin") and a
  // logged-in client (→ "loading"), tripping hydration. We always render "loading"
  // first, then the mount effect resolves to signin / result.
  const [state, setState] = useState<State>({ kind: "loading" });
  // The signed-in handle (client-only). Lets us tell when the viewer IS the
  // sharer — clicking your own link must show "your result", not you-vs-you.
  const [viewer, setViewer] = useState<string | null>(null);

  const check = () => {
    const u = getSavedUser();
    if (!u) {
      setViewer(null);
      setState({ kind: "signin" });
      return;
    }
    setViewer(u.username);
    setState({ kind: "loading" });
    fetch("/api/daily/result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: u.username, pin: u.pin, date }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        const you = d.result as DailyResult | null;
        if (!you) {
          setState({ kind: "play" });
          return;
        }
        // Show the result + share link immediately. The tournament run is purely
        // additive, so we fetch it in the background and patch it in when it lands
        // — a slow/hung /api/tournament/lookup must never block the daily result.
        setState({ kind: "result", you, tournament: null });
        void findTournamentRun(u.username, u.pin, date).then((tournament) => {
          if (!tournament) return;
          setState((s) => (s.kind === "result" ? { ...s, tournament } : s));
        });
      })
      .catch(() => setState({ kind: "error" }));
  };

  useEffect(() => {
    // check() handles both cases: signed in → loading→result, signed out → signin.
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const playHref = `/?d=${encodeURIComponent(date)}`;

  // Your own link → don't frame it as a head-to-head against yourself.
  const isSelfLink =
    !!sharer && !!viewer && normalizeName(viewer) === normalizeName(sharer.name);

  // Compute verdict when both results are known
  const verdict = (() => {
    if (!sharer || isSelfLink || state.kind !== "result") return null;
    const you = state.you;
    const diff = you.wins - sharer.wins;
    if (diff > 0) return { winner: "you", by: diff };
    if (diff < 0) return { winner: sharer.name, by: Math.abs(diff) };
    // Tiebreak by net rating
    const netDiff = you.margin - sharer.margin;
    if (netDiff > 0) return { winner: "you", by: 0 };
    if (netDiff < 0) return { winner: sharer.name, by: 0 };
    return { winner: "tie", by: 0 };
  })();

  return (
    <PageShell
      width="wide"
      paddingClassName="px-4 pb-0"
      footerSticky={false}
      footerClassName="mt-10 pb-5"
    >
      <div className="relative z-10 mt-6 flex flex-col sm:mt-8">
        <PageHeader
          eyebrowLeft={<>Daily · {shortDate(date)}</>}
          eyebrowRight={
            state.kind === "result" && sharer && !isSelfLink
              ? "Shared result · Both played"
              : undefined
          }
          kicker={
            sharer && !isSelfLink
              ? "Head to head"
              : isSelfLink
                ? "Your result"
                : "Daily challenge"
          }
          title={
            sharer && !isSelfLink ? (
              <>
              <span>You</span>
              <span
                className="font-cond"
                style={{ fontSize: "clamp(20px, 4vw, 44px)", color: "var(--md-ink-muted)" }}
              >
                vs
              </span>
              <span style={{ color: "var(--md-coral)" }}>{sharer.name}</span>
              </>
            ) : (
              prettyDate(date)
            )
          }
          titleClassName={
            sharer && !isSelfLink
              ? "flex flex-wrap items-baseline gap-x-3"
              : undefined
          }
          titleStyle={{
            fontSize:
              sharer && !isSelfLink
                ? "clamp(44px, 9vw, 96px)"
                : "clamp(36px, 7vw, 72px)",
            lineHeight: 0.9,
            letterSpacing: "-0.02em",
          }}
        />

        {/* ── Verdict stamp ── */}
        {verdict && (
          <div
            className="mt-5 flex items-center gap-3 border-2 border-[var(--md-ink)] px-5 py-3"
            style={{
              background: verdict.winner === "tie" ? "var(--md-ink)" : "var(--md-yellow)",
              boxShadow: "var(--md-shadow-sm)",
              alignSelf: "flex-start",
              maxWidth: "100%",
            }}
          >
            <span style={{ fontSize: 18 }} aria-hidden>
              {verdict.winner === "you" ? "🏆" : verdict.winner === "tie" ? "🤝" : "🏆"}
            </span>
            <span
              className="font-cond font-bold uppercase tracking-[0.1em]"
              style={{
                fontSize: "clamp(14px, 2.5vw, 20px)",
                color: verdict.winner === "tie" ? "var(--md-white)" : "var(--md-ink)",
              }}
            >
              {verdict.winner === "tie"
                ? "It's a tie"
                : verdict.winner === "you"
                  ? `You took it${verdict.by > 0 ? ` by ${verdict.by}` : ""}`
                  : `${sharer!.name} took it${verdict.by > 0 ? ` by ${verdict.by}` : ""}`}
            </span>
          </div>
        )}

        {/* ── Self-link note ── */}
        {isSelfLink && (
          <p className="mt-4 font-mono text-[13px] text-[var(--md-ink-muted)]">
            This is your own share link. Send it to friends to see who can beat your run.
          </p>
        )}

        {/* ── Loading / Error / Sign-in states ── */}
        {state.kind === "loading" && (
          <p className="mt-6 font-mono text-[13px] text-[var(--md-ink-muted)]">
            Checking your account…
          </p>
        )}
        {state.kind === "error" && (
          <p className="mt-6 font-mono text-[13px]" style={{ color: "var(--md-coral)" }}>
            Couldn&rsquo;t reach the league. Try again.
          </p>
        )}

        {/* ── Result cards (side by side on desktop, stacked on mobile) ── */}
        {(state.kind === "result" || (sharer && state.kind !== "signin" && state.kind !== "loading")) && (
          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:gap-5">
            {/* Sharer card */}
            {sharer && !isSelfLink && (
              <ResultCard
                label={`${sharer.name} · Sharer`}
                wins={sharer.wins}
                losses={sharer.losses}
                margin={sharer.margin}
                badge={verdict?.winner === sharer.name ? "winner" : null}
                rankLabel={null}
              />
            )}
            {/* Viewer's result */}
            {state.kind === "result" && (
              <ResultCard
                label="You"
                wins={state.you.wins}
                losses={state.you.losses}
                margin={state.you.margin}
                badge={verdict?.winner === "you" ? "winner" : verdict?.winner === sharer?.name ? "loser" : null}
                rankLabel={null}
                highlight
              />
            )}
          </div>
        )}

        {/* ── Tournament section ── */}
        {state.kind === "result" &&
          (state.tournament || (sharer?.tournament && !isSelfLink)) && (
            <div className="mt-6">
              <div className="mb-2 flex items-baseline gap-2">
                <span
                  className="font-archivo uppercase"
                  style={{ fontVariationSettings: '"wdth" 88', fontWeight: 800, fontSize: 15 }}
                >
                  Tournament Run
                </span>
                <span className="h-px flex-1 bg-[var(--md-paper-3)]" aria-hidden />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {sharer?.tournament && !isSelfLink && (
                  <TournCard label={sharer.name} run={sharer.tournament} />
                )}
                {state.tournament && (
                  <TournCard label="You" run={state.tournament} highlight />
                )}
              </div>
            </div>
          )}

        {/* ── Roster comparison (when viewer has played) ── */}
        {state.kind === "result" && sharer && !isSelfLink && (
          <RosterComparison sharer={sharer} you={state.you} />
        )}

        {/* ── Play CTA (not yet played) ── */}
        {state.kind === "play" && (
          <div className="mt-8">
            {sharer && !isSelfLink && (
              <p className="mb-4 font-mono text-[14px] text-[var(--md-ink)]">
                <strong style={{ color: "var(--md-coral)" }}>{sharer.name}</strong>{" "}
                went{" "}
                <strong>
                  {sharer.wins}&ndash;{sharer.losses}
                </strong>{" "}
                ({sign(sharer.margin)}). The same five team/era rolls are waiting for you.
              </p>
            )}
            <a href={playHref} className="md-btn md-btn--lg block w-full text-center sm:inline-flex sm:w-auto">
              Play the {prettyDate(date)} challenge →
            </a>
          </div>
        )}

        {/* ── CTA buttons (result state) ── */}
        {state.kind === "result" && (
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ShareLink date={date} you={state.you} />
            <Link href="/" className="md-btn md-btn--secondary">
              Back to daily82
            </Link>
          </div>
        )}
      </div>

      {/* ── Sign-in panel ── */}
      {state.kind === "signin" && (
        <div className="relative z-10 mt-8 w-full max-w-md">
          {sharer && !isSelfLink && (
            <p className="mb-4 font-mono text-[14px] text-[var(--md-ink)]">
              <strong style={{ color: "var(--md-coral)" }}>{sharer.name}</strong>{" "}
              went{" "}
              <strong>
                {sharer.wins}&ndash;{sharer.losses}
              </strong>{" "}
              ({sign(sharer.margin)}). Sign in to take on the challenge.
            </p>
          )}
          <DailySignIn
            title="Sign in to take the challenge"
            onCancel={() => {
              /* stay on the page; they can sign in to proceed */
            }}
            onSignedIn={() => check()}
          />
        </div>
      )}
    </PageShell>
  );
}

// ── Result card: ink-spread panel showing a single player's record ──
function ResultCard({
  label,
  wins,
  losses,
  margin,
  badge,
  rankLabel,
  highlight = false,
}: {
  label: string;
  wins: number;
  losses: number;
  margin: number;
  badge: "winner" | "loser" | null;
  rankLabel: string | null;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex flex-1 flex-col p-5 sm:p-6"
      style={{
        background: "var(--md-ink)",
        border: highlight
          ? "3px solid var(--md-coral)"
          : "2px solid var(--md-paper-3)",
        boxShadow: highlight ? "var(--md-shadow-pop)" : "var(--md-shadow-md)",
      }}
    >
      {/* Card header: name + verdict badge */}
      <div className="mb-3 flex items-center justify-between border-b border-[var(--md-paper-3)] pb-3">
        <span className="font-cond text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--md-white)]">
          {label}
        </span>
        {badge === "winner" && (
          <span
            className="font-cond text-[11px] font-bold uppercase tracking-[0.1em]"
            style={{ color: "var(--md-yellow)" }}
          >
            Winner
          </span>
        )}
        {badge === "loser" && (
          <span
            className="font-cond text-[11px] font-bold uppercase tracking-[0.1em]"
            style={{ color: "var(--md-coral)" }}
          >
            Runner Up
          </span>
        )}
      </div>

      {/* Record label */}
      <div className="font-cond text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--md-ink-muted)]">
        Final Record
      </div>

      {/* Score */}
      <div
        className="mt-1 flex items-baseline gap-2 leading-none"
        aria-label={`${wins} wins, ${losses} losses`}
      >
        <span
          className="font-cover"
          style={{
            fontSize: "clamp(52px, 10vw, 88px)",
            lineHeight: 0.9,
            color: "var(--md-coral)",
            letterSpacing: "-0.02em",
          }}
        >
          {wins}
        </span>
        <span
          className="font-mono font-bold"
          style={{ fontSize: "clamp(24px, 4vw, 40px)", color: "var(--md-ink-muted)", fontVariantNumeric: "tabular-nums" }}
          aria-hidden
        >
          &ndash;
        </span>
        <span
          className="font-mono font-bold tabular-nums"
          style={{ fontSize: "clamp(52px, 10vw, 88px)", lineHeight: 0.9, color: "var(--md-paper-3)" }}
        >
          {losses}
        </span>
      </div>

      {/* Net rating */}
      <div className="mt-4 flex items-baseline justify-between">
        <div>
          <div className="font-cond text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--md-ink-muted)]">
            Net Rating
          </div>
          <span
            className="font-mono text-[22px] font-bold tabular-nums"
            style={{ color: margin >= 0 ? "var(--md-yellow)" : "var(--md-coral)" }}
          >
            {sign(margin)}
          </span>
        </div>
        {rankLabel && (
          <div className="text-right">
            <div className="font-cond text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--md-ink-muted)]">
              Field Rank
            </div>
            <span className="font-mono text-[22px] font-bold text-[var(--md-white)]">
              {rankLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tournament run card ──
function TournCard({
  label,
  run,
  highlight = false,
}: {
  label: string;
  run: TournRun;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex flex-1 flex-col gap-1 border-2 border-[var(--md-paper-3)] p-4"
      style={{ background: "var(--md-ink)", boxShadow: highlight ? "var(--md-shadow-md)" : undefined }}
    >
      <div className="font-cond text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
        {label} · {tournPhrase(run.reachedRound)}
      </div>
      <div className="font-mono text-[15px] font-bold tabular-nums text-[var(--md-white)]">
        {run.recordW}&ndash;{run.recordL}{" "}
        <span style={{ color: run.realizedMargin >= 0 ? "var(--md-teal)" : "var(--md-coral)" }}>
          ({sign(run.realizedMargin)})
        </span>
      </div>
    </div>
  );
}

// ── Roster compare ──
// pickKey / decadeLabel / gqDiffView / slotWinner live in lib/rosterCompare (pure
// + unit-tested). Below are just the React cells that render their output.

// "GSW '10s" — the slot's shared team + decade (everyone drafts the same slot).
function teamEra(line: { team: string; season: number }): string {
  return `${line.team} '${String(Math.floor(line.season / 10) * 10).slice(2)}s`;
}

// Roster section: an interleaved slot-by-slot compare when the link carries the
// sharer's picks; otherwise the viewer's picks only (older links).
function RosterComparison({ sharer, you }: { sharer: Sharer; you: DailyResult }) {
  if (!you.roster.length) return null;
  return sharer.roster.length > 0 ? (
    <RosterVersus sharer={sharer} you={you} />
  ) : (
    <YourPicks you={you} />
  );
}

// Monochrome team chip from the SLAM design system (team-color accent bar dropped
// — team colors aren't used anywhere else in the app).
function TeamBadge({ team }: { team: string }) {
  return (
    <span
      className="font-archivo flex h-[30px] w-10 shrink-0 items-center justify-center overflow-clip border-2 border-[var(--md-ink)]"
      style={{
        background: "var(--md-ink)",
        color: "var(--md-paper)",
        fontVariationSettings: '"wght" 900, "wdth" 80',
        fontSize: 14,
        letterSpacing: "-0.02em",
      }}
    >
      {team}
    </span>
  );
}

// One player's name cell. Winner of the slot is coral, the other ink; a shared
// pick (you both drafted the same player) goes muted italic. `align` faces the
// name toward the central GQ-DIFF column.
function PlayerName({
  line,
  shared,
  winner,
  align,
}: {
  line: { name: string } | undefined;
  shared: boolean;
  winner: boolean;
  align: "left" | "right";
}) {
  if (!line) return <span className="min-w-0 flex-1" aria-hidden />;
  return (
    <span
      className={`min-w-0 flex-1 truncate font-mono text-[13px] leading-tight ${
        shared ? "font-normal italic" : "font-bold"
      } ${align === "right" ? "text-right" : "text-left"}`}
      style={{ color: shared ? "var(--md-ink-muted)" : winner ? "var(--md-coral)" : "var(--md-ink)" }}
      title={shared ? "You both picked this player" : undefined}
    >
      {line.name}
    </span>
  );
}

// The central GQ-DIFF cell, signed from YOUR side (positive = you're ahead).
// Visual impact scales with the gap: ≤10 a quiet number; >10 a marker stamp;
// >20 a bigger stamp. Colour encodes direction — press-yellow when you're ahead,
// inverted flame-red when you're behind. A push (same player / no gap) is a dash.
function GqDiff({
  you,
  them,
  shared,
}: {
  you: { gq: number };
  them: { gq: number } | undefined;
  shared: boolean;
}) {
  const v = gqDiffView(you.gq, them?.gq, shared);
  if (v.kind === "dash") {
    return <span className="font-mono text-[12px] text-[var(--md-paper-3)]">&mdash;</span>;
  }
  if (v.kind === "number") {
    return (
      <span className="font-mono text-[13px] font-bold tabular-nums text-[var(--md-ink)]">
        {v.text}
      </span>
    );
  }
  // Marker stamp: press-yellow when you're ahead (flame-pink offset), inverted
  // flame-red when you're behind (press-yellow offset); bigger when the gap > 20.
  return (
    <span
      className="font-marker inline-flex items-center border-2 border-[var(--md-ink)]"
      style={{
        background: v.ahead ? "var(--md-yellow)" : "var(--md-coral)",
        color: v.ahead ? "var(--md-ink)" : "var(--md-white)",
        boxShadow: v.ahead ? "2px 2px 0 0 #e0218a" : "2px 2px 0 0 var(--md-yellow)",
        padding: v.big ? "4px 12px" : "3px 10px",
        fontSize: v.big ? 18 : 15,
        lineHeight: v.big ? "20px" : "16px",
        rotate: "-4deg",
      }}
    >
      {v.text}
    </span>
  );
}

// Head-to-head, one row per slot: YOU ▸ | GQ DIFF | ◂ opponent, the two picks
// flanking a central signed GQ difference. Pairing is by TEAM, not array index:
// stored rosters are ordered by the drafted player's real position (hydrateRoster,
// backcourt→frontcourt), so the same index can be a different board slot for each
// player. Teams never repeat on a daily board (lib/boardGen), so the team uniquely
// identifies the slot — and both players drafted from the same five, so every row
// lines up.
function RosterVersus({ sharer, you }: { sharer: Sharer; you: DailyResult }) {
  const yours = you.roster;
  const theirByTeam = new Map(sharer.roster.map((p) => [p.team, p]));
  const head =
    "shrink-0 font-cond text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink)]";

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-baseline gap-2 border-b-2 border-[var(--md-ink)] pb-2">
        <span
          className="font-archivo uppercase"
          style={{ fontVariationSettings: '"wdth" 88', fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em" }}
        >
          Roster Comparison
        </span>
        <span className="h-px flex-1 bg-[var(--md-paper-3)]" aria-hidden />
      </div>

      {/* Column headers */}
      <div className="mb-1 flex items-center gap-2.5 border-b border-[var(--md-paper-3)] pb-2 sm:gap-3.5">
        <span className={`${head} w-6 sm:w-7`}>#</span>
        <span className={`${head} w-10 sm:w-[130px]`}>Era</span>
        <span className={`${head} min-w-0 flex-1 grow truncate text-right`}>You</span>
        <span className={`${head} w-[96px] text-center sm:w-[140px]`}>GQ Diff</span>
        <span className={`${head} min-w-0 flex-1 grow truncate`}>{sharer.name}</span>
      </div>

      {yours.map((mine, i) => {
        // Match the opponent's pick for the SAME board slot by team (see above).
        const them = theirByTeam.get(mine.team);
        const shared = !!them && pickKey(mine) === pickKey(them);
        const winner = slotWinner(mine.gq, them?.gq, shared);
        const youWin = winner === "you";
        const themWin = winner === "them";
        return (
          <div
            key={mine.team}
            className="flex items-center gap-2.5 border-b border-[var(--md-paper-3)] py-3 sm:gap-3.5"
          >
            {/* Slot number */}
            <span className="flex w-6 shrink-0 sm:w-7">
              <span
                className="font-mono flex h-[22px] w-[22px] items-center justify-center border border-[var(--md-ink)] text-[11px] font-bold tabular-nums"
                style={{ background: "var(--md-white)" }}
              >
                {i + 1}
              </span>
            </span>
            {/* Team badge + decade */}
            <span className="flex w-10 shrink-0 items-center gap-2 sm:w-[130px]">
              <TeamBadge team={mine.team} />
              <span className="hidden font-cond text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--md-ink-muted)] sm:inline">
                {decadeLabel(mine.season)}
              </span>
            </span>
            {/* Your pick (faces center) */}
            <PlayerName line={mine} shared={shared} winner={youWin} align="right" />
            {/* Signed GQ difference, from your side */}
            <span className="flex w-[96px] shrink-0 items-center justify-center sm:w-[140px]">
              <GqDiff you={mine} them={them} shared={shared} />
            </span>
            {/* Opponent's pick (faces center) */}
            <PlayerName line={them} shared={shared} winner={themWin} align="left" />
          </div>
        );
      })}
    </div>
  );
}

// ── Your roster table (fallback for older links with no sharer roster) ──
function YourPicks({ you }: { you: DailyResult }) {
  const { roster } = you;
  if (!roster.length) return null;

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-baseline gap-2 border-b border-[var(--md-ink)] pb-2">
        <span
          className="font-archivo uppercase"
          style={{ fontVariationSettings: '"wdth" 88', fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em" }}
        >
          Your Picks
        </span>
        <span className="h-px flex-1 bg-[var(--md-paper-3)]" aria-hidden />
        <span className="font-mono text-[11px] text-[var(--md-ink-muted)]">5 rounds · same spins</span>
      </div>

      {/* Column headers */}
      <div
        className="mb-1 grid border-b border-[var(--md-paper-3)] pb-2"
        style={{ gridTemplateColumns: "40px minmax(0,2fr) minmax(0,4fr) 52px 48px 48px" }}
      >
        {(["#", "Team · Era", "Player", "PTS", "REB", "AST"] as const).map((h) => (
          <span
            key={h}
            className="font-cond text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]"
          >
            {h}
          </span>
        ))}
      </div>

      {roster.map((line, i) => (
        <div
          key={i}
          className="grid items-center border-b border-[var(--md-paper-3)] py-2.5"
          style={{
            gridTemplateColumns: "40px minmax(0,2fr) minmax(0,4fr) 52px 48px 48px",
            background: i % 2 === 1 ? "var(--md-paper-2)" : undefined,
          }}
        >
          {/* Slot number */}
          <span
            className="font-mono flex h-5 w-5 items-center justify-center border border-[var(--md-ink)] text-[11px] font-bold tabular-nums"
            style={{ background: "var(--md-white)" }}
          >
            {i + 1}
          </span>
          {/* Team · era — the slot's true identity (the lineup slot isn't stored,
              and the roster is position-sorted, so a G/FLEX/W/B label can't be
              recovered reliably). */}
          <span
            className="font-cond text-[10px] font-bold uppercase tracking-[0.06em]"
            style={{ color: "var(--md-ink-muted)" }}
          >
            {teamEra(line)}
          </span>
          {/* Player name */}
          <div className="font-mono text-[13px] font-bold text-[var(--md-ink)] leading-tight">
            {line.name}
          </div>
          {/* Stats */}
          <span className="font-mono text-[13px] font-bold tabular-nums text-right" style={{ color: "var(--md-coral)" }}>
            {line.pts.toFixed(1)}
          </span>
          <span className="font-mono text-[12px] tabular-nums text-right text-[var(--md-ink-muted)]">
            {line.reb.toFixed(1)}
          </span>
          <span className="font-mono text-[12px] tabular-nums text-right text-[var(--md-ink-muted)]">
            {line.ast.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}

// Mint a signed link for the viewer's OWN stored result and hand it off (native
// share sheet on touch, clipboard on desktop) so they can pull in more players.
function ShareLink({ date, you }: { date: string; you: DailyResult }) {
  // Mint the signed share URL up front, in an effect on mount — NOT inside the
  // click handler. On iOS Safari the `await fetch(...)` would consume the
  // user-gesture activation before navigator.share/clipboard runs, silently
  // failing. By the time the user taps, shareUrl is already in hand so the
  // click handler hits presentShare with no preceding heavy await.
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  // loading: minting the token · ready: link in hand · done: shared/copied ·
  // error: mint OR share failed (button stays tappable so the user can retry).
  const [status, setStatus] = useState<"loading" | "ready" | "done" | "error">("loading");
  // Bumping this re-runs the mint effect (retry after a failed token fetch).
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const u = getSavedUser();
    if (!u) {
      setStatus("error"); // can't mint a signed link without a saved account
      return;
    }
    let active = true;
    setStatus("loading");
    fetch("/api/daily/share", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: u.username, pin: u.pin, date }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return;
        if (d?.share) {
          setShareUrl(`${SITE_URL}/d/${date}?s=${encodeURIComponent(d.share as string)}`);
          setStatus("ready");
        } else {
          setStatus("error"); // non-OK response or missing token
        }
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [date, attempt]);

  const onShare = async () => {
    if (!shareUrl) return;
    const text = `daily82 · ${you.wins}-${you.losses} (${sign(
      you.margin,
    )}). Can you beat it?\n${shareUrl}`;
    const outcome = await presentShare({ blob: null, filename: "", text, link: shareUrl });
    if (outcome === "shared" || outcome === "copied") {
      setStatus("done");
      setTimeout(() => setStatus("ready"), 1800);
    } else if (outcome === "failed") {
      setStatus("error"); // copy blocked — let the user retry the share
    }
    // "cancelled" → leave the button as-is
  };

  // Ready → share. Error/no-link → retry: re-mint if the token never arrived,
  // otherwise re-attempt the share itself.
  const onClick = () => {
    if (shareUrl) {
      void onShare();
    } else {
      setAttempt((n) => n + 1);
    }
  };

  return (
    <button
      type="button"
      className="md-btn md-btn--lg"
      disabled={status === "loading"}
      onClick={onClick}
    >
      {status === "loading"
        ? "Preparing…"
        : status === "done"
          ? "Shared!"
          : status === "error"
            ? "↻ Try again"
            : "↑ Share your result"}
    </button>
  );
}

// Look up the viewer's tournament team for this daily date (mode='daily'). Returns
// null on any miss or error — the tournament line is purely additive.
async function findTournamentRun(
  name: string,
  pin: string,
  date: string,
): Promise<TournRun | null> {
  try {
    const res = await fetch("/api/tournament/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, pin }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as TournamentLookupResponse;
    // teams are sorted newest-first; the first daily match for this date wins.
    const team = data.teams.find((t) => t.mode === "daily" && t.dailyDate === date);
    if (!team) return null;
    return {
      recordW: team.recordW,
      recordL: team.recordL,
      realizedMargin: team.realizedMargin,
      reachedRound: team.reachedRound,
    };
  } catch {
    return null;
  }
}
