"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PlayerList } from "@/components/PlayerList";
import { GlobalHeader } from "@/components/GlobalHeader";
import { MOTHERDUCK_URL } from "@/lib/site";

interface Combo {
  team: string;
  decade: number;
  count: number;
}

type Status = "loading" | "ok" | "error";

// Read-only Player Cards browser. The landing shows every (team, decade) combo as
// a searchable grid; picking one deep-links to `?team=LAL&decade=1980`, where the
// shared Classic player list renders in browse mode (tap any player → career card).
export default function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; decade?: string }>;
}) {
  const { team, decade } = use(searchParams);
  const decadeNum = Number(decade);
  const validCombo =
    !!team &&
    /^[A-Z]{3}$/.test(team) &&
    Number.isInteger(decadeNum) &&
    decadeNum >= 1900 &&
    decadeNum <= 2100;

  return (
    <main className="relative mx-auto flex min-h-full max-w-3xl flex-col overflow-x-hidden px-4 pb-12 sm:pb-16">
      <div className="md-sunbeam" />

      <GlobalHeader />

      {validCombo ? (
        <TeamCards team={team!} decade={decadeNum} />
      ) : (
        <ComboGrid />
      )}

      <footer className="relative z-10 mt-auto pt-12 text-center">
        <p className="font-display text-xs text-[var(--md-ink-muted)]">
          Powered by{" "}
          <a
            href={MOTHERDUCK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--md-ink)]"
          >
            MotherDuck
          </a>{" "}
          · <code>nba_box_scores_v2</code>
        </p>
        <p className="mt-2 text-[11px] text-[var(--md-ink-muted)]">
          An independent project, not affiliated with or endorsed by the NBA.
        </p>
      </footer>
    </main>
  );
}

// The searchable grid of every browsable team+decade combo.
function ComboGrid() {
  const [combos, setCombos] = useState<Combo[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [q, setQ] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/combos")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (active) {
          setCombos(d.combos ?? []);
          setStatus("ok");
        }
      })
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    if (!nq) return combos;
    return combos.filter(
      (c) =>
        c.team.toLowerCase().includes(nq) ||
        `${c.decade}`.includes(nq) ||
        `${c.decade}s`.includes(nq),
    );
  }, [combos, q]);

  return (
    <section className="relative z-10 mt-6 flex flex-col sm:mt-8">
      <div className="text-center">
        <h1
          className="font-display font-bold tracking-tight"
          style={{ fontSize: "clamp(34px, 9vw, 64px)", lineHeight: 1 }}
        >
          Player cards
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[14px] leading-relaxed sm:text-[15px]">
          Browse every team &amp; era, then flip through each player&rsquo;s
          career card. Pick a team to start.
        </p>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a year or team (e.g. 1996 or LAL)…"
        className="mt-6 w-full border-2 border-[var(--md-ink)] bg-[var(--md-white)] px-3 py-2 font-display text-sm outline-none focus:bg-[var(--md-paper)]"
      />

      {status === "loading" && (
        <div className="mt-8 text-center font-display text-sm text-[var(--md-ink-muted)]">
          Loading teams…
        </div>
      )}
      {status === "error" && (
        <div className="mt-8 text-center font-display text-sm text-[var(--md-coral)]">
          Couldn&rsquo;t load the league right now.
        </div>
      )}
      {status === "ok" && filtered.length === 0 && (
        <div className="mt-8 text-center font-display text-sm text-[var(--md-ink-muted)]">
          No teams match &ldquo;{q}&rdquo;.
        </div>
      )}

      {status === "ok" && filtered.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((c) => (
            <Link
              key={`${c.team}|${c.decade}`}
              href={`/cards?team=${c.team}&decade=${c.decade}`}
              className="md-card md-card--lift flex flex-col gap-1 p-4 text-left transition-transform hover:-translate-y-0.5"
            >
              <div className="font-display text-2xl font-bold tracking-tight">
                {c.team}
              </div>
              <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                {c.decade}s
              </div>
              <div className="mt-1 font-display text-[11px] text-[var(--md-ink-muted)]">
                {c.count} players
              </div>
            </Link>
          ))}
        </div>
      )}

      <Link
        href="/"
        className="mx-auto mt-8 font-display text-xs font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
      >
        ← Back to 82-0+
      </Link>
    </section>
  );
}

// Read-only roster for one team+decade: the shared Classic list in browse mode.
function TeamCards({ team, decade }: { team: string; decade: number }) {
  return (
    <section className="relative z-10 mt-6 flex flex-col sm:mt-8">
      <Link
        href="/cards"
        className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
      >
        ← All teams
      </Link>
      <div className="mt-3 flex items-baseline gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {team}
        </h1>
        <span className="font-display text-base font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          {decade}s
        </span>
      </div>
      <p className="mt-1 font-display text-xs text-[var(--md-ink-muted)]">
        Tap any player to flip through their career card.
      </p>

      <div className="mt-4">
        <PlayerList team={team} decade={decade} mode="classic" browse />
      </div>
    </section>
  );
}
