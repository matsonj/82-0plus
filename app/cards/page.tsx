"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlayerList } from "@/components/PlayerList";
import { GlobalHeader } from "@/components/GlobalHeader";
import { MOTHERDUCK_URL } from "@/lib/site";

interface Combo {
  team: string;
  decade: number;
  count: number;
}

interface PlayerMatch {
  entity_id: string;
  player_name: string;
  team: string;
  decade: number;
  best_season: number;
}

type Status = "loading" | "ok" | "error";

// Build a /cards URL, carrying the active search query so a filtered view stays
// filtered as you drill in and back out.
function cardsHref(params: { team?: string; decade?: number; q?: string }): string {
  const sp = new URLSearchParams();
  if (params.team) sp.set("team", params.team);
  if (params.decade != null) sp.set("decade", String(params.decade));
  const q = params.q?.trim();
  if (q) sp.set("q", q);
  const s = sp.toString();
  return s ? `/cards?${s}` : "/cards";
}

// Does a (team, era) combo match the current query? A team-code or year query is
// a plain substring test; a player query matches the exact (team, era) cards the
// player appears on — so a name narrows each stack to just his eras.
function comboMatches(
  team: string,
  decade: number,
  nq: string,
  playerCombos: Set<string>,
): boolean {
  if (!nq) return true;
  return (
    team.toLowerCase().includes(nq) ||
    `${decade}`.includes(nq) ||
    `${decade}s`.includes(nq) ||
    playerCombos.has(`${team}|${decade}`)
  );
}

// Read-only Player Cards browser, three levels deep:
//   /cards                       → a stack per team (A→Z)
//   /cards?team=LAL              → that team's stack, fanned into era cards (newest→oldest)
//   /cards?team=LAL&decade=1980  → the shared Classic roster in browse mode (tap → career card)
// A `?q=` search filters every level: stacks shown, eras within a stack, and is
// preserved across the back links.
export default function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; decade?: string; q?: string }>;
}) {
  const { team, decade, q } = use(searchParams);
  const teamValid = !!team && /^[A-Z]{3}$/.test(team);
  const decadeNum = Number(decade);
  const decadeValid =
    Number.isInteger(decadeNum) && decadeNum >= 1900 && decadeNum <= 2100;
  const query = (q ?? "").slice(0, 64);

  return (
    <main className="relative mx-auto flex min-h-full max-w-3xl flex-col overflow-x-hidden px-4 pb-12 sm:pb-16">
      <div className="md-sunbeam" />

      <GlobalHeader />

      {teamValid && decadeValid ? (
        <TeamRoster team={team!} decade={decadeNum} query={query} />
      ) : teamValid ? (
        <TeamStack team={team!} query={query} />
      ) : (
        <StacksGrid initialQuery={query} />
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

// Debounced player-name search → the set of (team|decade) combos the name hits.
// `searching` is true while a ≥2-char query is in flight, so views can hold off
// their "nothing matches" message until results land.
function usePlayerCombos(q: string): {
  playerCombos: Set<string>;
  searching: boolean;
} {
  const nq = q.trim();
  const [matches, setMatches] = useState<PlayerMatch[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (nq.length < 2) {
      setMatches([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/player-search?q=${encodeURIComponent(nq)}`)
        .then((r) => (r.ok ? r.json() : { matches: [] }))
        .then((d) => active && (setMatches(d.matches ?? []), setSearching(false)))
        .catch(() => active && (setMatches([]), setSearching(false)));
    }, 180);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [nq]);
  const playerCombos = useMemo(
    () => new Set(matches.map((m) => `${m.team}|${m.decade}`)),
    [matches],
  );
  return { playerCombos, searching };
}

interface Stack {
  team: string;
  decades: number[]; // newest → oldest, already filtered to the query
}

// Landing: one stack per team (A→Z). A search filters which stacks show AND how
// many eras each stack covers (a player narrows it to just his eras).
function StacksGrid({ initialQuery }: { initialQuery: string }) {
  const { combos, status } = useCombos();
  const [q, setQ] = useState(initialQuery);
  const { playerCombos, searching } = usePlayerCombos(q);
  const router = useRouter();

  // Mirror the query into the URL (debounced, replace — no history spam) so the
  // search survives a browser back from a stack/roster, not just the in-page links.
  useEffect(() => {
    const t = setTimeout(
      () => router.replace(cardsHref({ q }), { scroll: false }),
      250,
    );
    return () => clearTimeout(t);
  }, [q, router]);

  const stacks = useMemo<Stack[]>(() => {
    const nq = q.trim().toLowerCase();
    const byTeam = new Map<string, number[]>();
    for (const c of combos) {
      if (!comboMatches(c.team, c.decade, nq, playerCombos)) continue;
      const list = byTeam.get(c.team) ?? [];
      list.push(c.decade);
      byTeam.set(c.team, list);
    }
    return [...byTeam]
      .map(([team, decades]) => ({
        team,
        decades: decades.sort((a, b) => b - a), // most recent → oldest
      }))
      .sort((a, b) => a.team.localeCompare(b.team)); // A → Z
  }, [combos, q, playerCombos]);

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
        placeholder="Search a team, player, or year (e.g. LAL, Jokić, 1996)…"
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
      {status === "ok" && q.trim().length > 0 && stacks.length === 0 && !searching && (
        <div className="mt-8 text-center font-display text-sm text-[var(--md-ink-muted)]">
          Nothing matches &ldquo;{q}&rdquo;.
        </div>
      )}

      {status === "ok" && stacks.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-4">
          {stacks.map((s) => (
            <CardStack
              key={s.team}
              team={s.team}
              eras={s.decades.length}
              q={q}
            />
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
function CardStack({
  team,
  eras,
  q,
}: {
  team: string;
  eras: number;
  q: string;
}) {
  return (
    <Link
      href={cardsHref({ team, q })}
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

// The opened stack: one team's era cards, most recent → oldest — filtered to the
// query (so opening a player's stack shows only his eras).
function TeamStack({ team, query }: { team: string; query: string }) {
  const { combos, status } = useCombos();
  const { playerCombos, searching } = usePlayerCombos(query);
  const eras = useMemo(() => {
    const nq = query.trim().toLowerCase();
    return combos
      .filter(
        (c) =>
          c.team === team && comboMatches(c.team, c.decade, nq, playerCombos),
      )
      .sort((a, b) => b.decade - a.decade); // most recent → oldest
  }, [combos, team, query, playerCombos]);

  // Still resolving the player search → don't flash an empty state.
  const settled = status === "ok" && !searching;

  return (
    <section className="relative z-10 mt-6 flex flex-col sm:mt-8">
      <Link
        href={cardsHref({ q: query })}
        className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
      >
        ← All teams
      </Link>
      <div className="mt-3 flex items-baseline gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {team}
        </h1>
        {settled && eras.length > 0 && (
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
      {settled && eras.length === 0 && (
        <div className="mt-8 text-center font-display text-sm text-[var(--md-ink-muted)]">
          No eras on record for {team}
          {query.trim() ? ` matching “${query}”` : ""}.
        </div>
      )}

      {settled && eras.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {eras.map((c) => (
            <Link
              key={c.decade}
              href={cardsHref({ team, decade: c.decade, q: query })}
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
function TeamRoster({
  team,
  decade,
  query,
}: {
  team: string;
  decade: number;
  query: string;
}) {
  return (
    <section className="relative z-10 mt-6 flex flex-col sm:mt-8">
      <Link
        href={cardsHref({ team, q: query })}
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
