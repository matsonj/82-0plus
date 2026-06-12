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

// Read-only Player Cards browser, three levels deep:
//   /cards                       → a stack per team (A→Z)
//   /cards?team=LAL              → that team's stack, fanned into era cards (newest→oldest)
//   /cards?team=LAL&decade=1980  → the shared Classic roster in browse mode (tap → career card)
export default function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; decade?: string }>;
}) {
  const { team, decade } = use(searchParams);
  const teamValid = !!team && /^[A-Z]{3}$/.test(team);
  const decadeNum = Number(decade);
  const decadeValid =
    Number.isInteger(decadeNum) && decadeNum >= 1900 && decadeNum <= 2100;

  return (
    <main className="relative mx-auto flex min-h-full max-w-3xl flex-col overflow-x-hidden px-4 pb-12 sm:pb-16">
      <div className="md-sunbeam" />

      <GlobalHeader />

      {teamValid && decadeValid ? (
        <TeamRoster team={team!} decade={decadeNum} />
      ) : teamValid ? (
        <TeamStack team={team!} />
      ) : (
        <StacksGrid />
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

// Load every browsable (team, decade) combo once (the list is small + CDN-cached).
function useCombos() {
  const [combos, setCombos] = useState<Combo[]>([]);
  const [status, setStatus] = useState<Status>("loading");
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
  return { combos, status };
}

interface Stack {
  team: string;
  decades: number[]; // newest → oldest
  eras: number;
}

// Landing: one stack per team, A→Z. Search filters by team code or year.
function StacksGrid() {
  const { combos, status } = useCombos();
  const [q, setQ] = useState("");

  const stacks = useMemo<Stack[]>(() => {
    const byTeam = new Map<string, number[]>();
    for (const c of combos) {
      const list = byTeam.get(c.team) ?? [];
      list.push(c.decade);
      byTeam.set(c.team, list);
    }
    return [...byTeam]
      .map(([team, decades]) => ({
        team,
        decades: decades.sort((a, b) => b - a), // most recent → oldest
        eras: decades.length,
      }))
      .sort((a, b) => a.team.localeCompare(b.team)); // A → Z
  }, [combos]);

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    if (!nq) return stacks;
    // Match the team code, or any era a year query falls in (e.g. "1996" → 1990s).
    return stacks.filter(
      (s) =>
        s.team.toLowerCase().includes(nq) ||
        s.decades.some(
          (d) => `${d}`.includes(nq) || `${d}s`.includes(nq),
        ),
    );
  }, [stacks, q]);

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
          Every team is a stack of eras. Open one, then flip through each
          player&rsquo;s career card.
        </p>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a team or year (e.g. LAL or 1996)…"
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
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((s) => (
            <CardStack key={s.team} team={s.team} eras={s.eras} />
          ))}
        </div>
      )}

      <Link
        href="/"
        className="mx-auto mt-10 font-display text-xs font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
      >
        ← Back to 82-0+
      </Link>
    </section>
  );
}

// A team rendered as a little deck of cards: two offset layers peeking behind the
// front card, so it reads as a stack you can open.
function CardStack({ team, eras }: { team: string; eras: number }) {
  return (
    <Link
      href={`/cards?team=${team}`}
      className="group relative mr-1.5 mt-1.5 block transition-transform hover:-translate-y-0.5"
      aria-label={`${team} — ${eras} era${eras === 1 ? "" : "s"}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-y-1.5 translate-x-1.5 border-2 border-[var(--md-ink)] bg-[var(--md-paper-3)]"
        style={{ boxShadow: "var(--md-shadow-sm)" }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-y-[3px] translate-x-[3px] border-2 border-[var(--md-ink)] bg-[var(--md-paper)]"
      />
      <div
        className="relative flex flex-col gap-1 border-2 border-[var(--md-ink)] bg-[var(--md-white)] p-4"
        style={{ boxShadow: "var(--md-shadow-md)" }}
      >
        <div className="font-display text-2xl font-bold tracking-tight">
          {team}
        </div>
        <div className="font-display text-[11px] font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          {eras} era{eras === 1 ? "" : "s"}
        </div>
      </div>
    </Link>
  );
}

// The opened stack: one team's era cards, most recent → oldest.
function TeamStack({ team }: { team: string }) {
  const { combos, status } = useCombos();
  const eras = useMemo(
    () =>
      combos
        .filter((c) => c.team === team)
        .sort((a, b) => b.decade - a.decade), // most recent → oldest
    [combos, team],
  );

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
        {status === "ok" && eras.length > 0 && (
          <span className="font-display text-base font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            {eras.length} era{eras.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <p className="mt-1 font-display text-xs text-[var(--md-ink-muted)]">
        Pick an era to flip through its roster.
      </p>

      {status === "loading" && (
        <div className="mt-8 text-center font-display text-sm text-[var(--md-ink-muted)]">
          Loading eras…
        </div>
      )}
      {status === "error" && (
        <div className="mt-8 text-center font-display text-sm text-[var(--md-coral)]">
          Couldn&rsquo;t load the league right now.
        </div>
      )}
      {status === "ok" && eras.length === 0 && (
        <div className="mt-8 text-center font-display text-sm text-[var(--md-ink-muted)]">
          No eras on record for {team}.
        </div>
      )}

      {status === "ok" && eras.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {eras.map((c) => (
            <Link
              key={c.decade}
              href={`/cards?team=${team}&decade=${c.decade}`}
              className="md-card md-card--lift flex flex-col gap-1 p-4 text-left transition-transform hover:-translate-y-0.5"
            >
              <div className="font-display text-2xl font-bold tracking-tight">
                {c.decade}s
              </div>
              <div className="mt-1 font-display text-[11px] text-[var(--md-ink-muted)]">
                {c.count} players
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

// A single era's roster: the shared Classic list in browse mode.
function TeamRoster({ team, decade }: { team: string; decade: number }) {
  return (
    <section className="relative z-10 mt-6 flex flex-col sm:mt-8">
      <Link
        href={`/cards?team=${team}`}
        className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
      >
        ← {team} eras
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
