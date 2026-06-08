"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DailySignIn } from "@/components/DailySignIn";
import { getSavedUser } from "@/lib/tournamentSession";
import type { DailyResult } from "@/lib/dailyResults";

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

/** Sharer's redacted result carried in the link. */
export interface Sharer {
  name: string;
  wins: number;
  losses: number;
  margin: number;
  perfect: boolean;
}

type State =
  | { kind: "signin" }
  | { kind: "loading" }
  | { kind: "play" } // signed in, hasn't done this day
  | { kind: "compare"; you: DailyResult }
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

  const check = () => {
    const u = getSavedUser();
    if (!u) {
      setState({ kind: "signin" });
      return;
    }
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
        setState(you ? { kind: "compare", you } : { kind: "play" });
      })
      .catch(() => setState({ kind: "error" }));
  };

  useEffect(() => {
    if (getSavedUser()) check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const playHref = `/?d=${encodeURIComponent(date)}`;

  return (
    <main className="relative mx-auto flex min-h-full max-w-xl flex-col items-center px-4 py-12 text-center">
      <div className="md-sunbeam" />
      <Link href="/" className="relative z-10 flex items-center gap-2 font-display text-lg font-bold tracking-tight">
        <span className="text-2xl" aria-hidden>🦆</span>
        82-0<span className="text-[var(--md-orange)]">+</span>
      </Link>

      <div className="md-card md-card--lift relative z-10 mt-8 flex w-full flex-col gap-4 p-6">
        <div className="md-capsule mx-auto">Daily Challenge · {prettyDate(date)}</div>

        {sharer && (
          <p className="font-display text-sm text-[var(--md-ink)]">
            <strong className="text-[var(--md-orange-deep)]">{sharer.name}</strong>{" "}
            went{" "}
            <strong>
              {sharer.wins}&ndash;{sharer.losses}
            </strong>{" "}
            ({sign(sharer.margin)}). The same five team/era rolls are waiting for you.
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

        {state.kind === "compare" && (
          <>
            <div className="grid gap-1 text-left">
              <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                Head to head
              </div>
              {sharer && (
                <Row label={sharer.name} wins={sharer.wins} losses={sharer.losses} margin={sharer.margin} />
              )}
              <Row label="You" wins={state.you.wins} losses={state.you.losses} margin={state.you.margin} highlight />
            </div>
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
