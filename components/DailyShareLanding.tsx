"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DailySignIn } from "@/components/DailySignIn";
import { getSavedUser } from "@/lib/tournamentSession";
import { normalizeName } from "@/lib/tournamentValidation";
import { SITE_URL } from "@/lib/site";
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

const sign = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;

// reachedRound: 0 = lost R1 … 4 = champion.
function tournPhrase(round: number): string {
  return (
    ["Lost R1", "Lost Conf. Semis", "Lost Conf. Finals", "Lost the Final", "🏆 Champion"][
      round
    ] ?? "Eliminated"
  );
}

/** Sharer's redacted result carried in the link. */
export interface Sharer {
  name: string;
  wins: number;
  losses: number;
  margin: number;
  perfect: boolean;
}

/** The viewer's tournament run for this daily date, if they submitted one. */
interface TournRun {
  recordW: number;
  recordL: number;
  realizedMargin: number;
  reachedRound: number;
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
  const [state, setState] = useState<State>(() =>
    getSavedUser() ? { kind: "loading" } : { kind: "signin" },
  );
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
    if (getSavedUser()) check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const playHref = `/?d=${encodeURIComponent(date)}`;

  // Your own link → don't frame it as a head-to-head against yourself.
  const isSelfLink =
    !!sharer && !!viewer && normalizeName(viewer) === normalizeName(sharer.name);

  return (
    <main className="relative mx-auto flex min-h-full max-w-xl flex-col items-center px-4 py-12 text-center">
      <div className="md-sunbeam" />
      <Link href="/" className="relative z-10 flex items-center gap-2 font-display text-lg font-bold tracking-tight">
        <span className="text-2xl" aria-hidden>🦆</span>
        82-0<span className="text-[var(--md-orange)]">+</span>
      </Link>

      <div className="md-card md-card--lift relative z-10 mt-8 flex w-full flex-col gap-4 p-6">
        <div className="md-capsule mx-auto">Daily Challenge · {prettyDate(date)}</div>

        {sharer && !isSelfLink && (
          <p className="font-display text-sm text-[var(--md-ink)]">
            <strong className="text-[var(--md-orange-deep)]">{sharer.name}</strong>{" "}
            went{" "}
            <strong>
              {sharer.wins}&ndash;{sharer.losses}
            </strong>{" "}
            ({sign(sharer.margin)}). The same five team/era rolls are waiting for you.
          </p>
        )}

        {sharer && isSelfLink && (
          <p className="font-display text-sm text-[var(--md-ink-muted)]">
            This is the link you shared. Send it to more friends to see who can beat
            your run.
          </p>
        )}

        {state.kind === "signin" && (
          <p className="font-display text-sm text-[var(--md-ink-muted)]">
            Sign in to take on this challenge and see how you stack up.
          </p>
        )}

        {state.kind === "loading" && (
          <p className="font-display text-sm text-[var(--md-ink-muted)]">Checking your account…</p>
        )}

        {state.kind === "error" && (
          <p className="font-display text-sm text-[var(--md-coral)]">
            Couldn&rsquo;t reach the league. Try again.
          </p>
        )}

        {state.kind === "play" && (
          <a href={playHref} className="md-btn md-btn--lg md-btn--teal">
            Play the {prettyDate(date)} challenge
          </a>
        )}

        {state.kind === "result" && (
          <>
            <div className="grid gap-1 text-left">
              <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                {isSelfLink || !sharer ? "Your result" : "Head to head"}
              </div>
              {sharer && !isSelfLink && (
                <Row label={sharer.name} wins={sharer.wins} losses={sharer.losses} margin={sharer.margin} />
              )}
              <Row
                label="You"
                wins={state.you.wins}
                losses={state.you.losses}
                margin={state.you.margin}
                highlight
              />
            </div>

            {state.tournament && (
              <div className="grid gap-1 text-left">
                <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                  Your tournament run
                </div>
                <div className="flex items-baseline justify-between gap-2 border-b border-[var(--md-paper-3)] py-1 font-display text-sm">
                  <span className="font-bold">
                    {tournPhrase(state.tournament.reachedRound)}
                  </span>
                  <span className="font-bold tabular-nums">
                    {state.tournament.recordW}&ndash;{state.tournament.recordL}{" "}
                    <span
                      style={{
                        color:
                          state.tournament.realizedMargin >= 0
                            ? "var(--md-teal)"
                            : "var(--md-coral)",
                      }}
                    >
                      ({sign(state.tournament.realizedMargin)})
                    </span>
                  </span>
                </div>
              </div>
            )}

            <ShareLink date={date} you={state.you} />

            <Link href="/" className="md-btn md-btn--lg md-btn--ink">
              Back to 82-0+
            </Link>
          </>
        )}
      </div>

      {state.kind === "signin" && (
        <DailySignIn
          title="Sign in to take the challenge"
          onCancel={() => {
            /* stay on the page; they can sign in to proceed */
          }}
          onSignedIn={check}
        />
      )}
    </main>
  );
}

// Mint a signed link for the viewer's OWN stored result and hand it off (native
// share sheet on touch, clipboard on desktop) so they can pull in more players.
function ShareLink({ date, you }: { date: string; you: DailyResult }) {
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");

  const onShare = async () => {
    const u = getSavedUser();
    if (!u) return;
    setStatus("working");
    try {
      const res = await fetch("/api/daily/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: u.username, pin: u.pin, date }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { share } = await res.json();
      const url = `${SITE_URL}/d/${date}?s=${encodeURIComponent(share as string)}`;
      const text = `82-0+ Daily ${prettyDate(date)} — I went ${you.wins}-${you.losses} (${sign(
        you.margin,
      )}). Can you beat it?\n${url}`;

      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
      const touch =
        typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
      if (touch && nav.share) {
        try {
          await nav.share({ text, title: "82-0+" });
        } catch {
          /* dismissed — treat as handled */
        }
        setStatus("idle");
        return;
      }
      await navigator.clipboard.writeText(url);
      setStatus("done");
      setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2500);
    }
  };

  return (
    <button
      type="button"
      className="md-btn md-btn--lg md-btn--teal"
      disabled={status === "working"}
      onClick={onShare}
    >
      {status === "working"
        ? "Making link…"
        : status === "done"
          ? "Link copied!"
          : status === "error"
            ? "Try again"
            : "📣 Share & challenge friends"}
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

function Row({
  label,
  wins,
  losses,
  margin,
  highlight,
}: {
  label: string;
  wins: number;
  losses: number;
  margin: number;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-2 border-b border-[var(--md-paper-3)] py-1 font-display text-sm"
      style={highlight ? { fontWeight: 700 } : undefined}
    >
      <span className={highlight ? "text-[var(--md-orange-deep)]" : ""}>{label}</span>
      <span>
        {wins}&ndash;{losses}{" "}
        <span style={{ color: margin >= 0 ? "var(--md-teal)" : "var(--md-coral)" }}>
          ({sign(margin)})
        </span>
      </span>
    </div>
  );
}
