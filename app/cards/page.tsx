"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlayerList } from "@/components/PlayerList";
import { PageShell } from "@/components/layout/PageShell";
import { CardsSearchHeader } from "@/components/cards/CardsSearchHeader";
import { CardStack } from "@/components/cards/CardStack";

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
  // A full 4-digit year matches its decade bucket (1996 → the 1990s). Partial
  // digits still substring-match the decade label below ("199" → 1990).
  const year = /^\d{4}$/.test(nq) ? Number(nq) : NaN;
  const yearInDecade = Number.isInteger(year) && decade === year - (year % 10);
  return (
    team.toLowerCase().includes(nq) ||
    yearInDecade ||
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
  // A repeated param (?q=a&q=b) arrives as string[], so accept both shapes and
  // collapse to the first value before any string ops.
  searchParams: Promise<{
    team?: string | string[];
    decade?: string | string[];
    q?: string | string[];
  }>;
}) {
  const sp = use(searchParams);
  const first = (v: string | string[] | undefined): string =>
    (Array.isArray(v) ? v[0] : v) ?? "";
  const team = first(sp.team);
  const decade = first(sp.decade);
  const teamValid = /^[A-Z]{3}$/.test(team);
  const decadeNum = Number(decade);
  const decadeValid =
    decade !== "" &&
    Number.isInteger(decadeNum) &&
    decadeNum >= 1900 &&
    decadeNum <= 2100;
  const query = first(sp.q).slice(0, 64);

  return (
    <PageShell width="standard" className="min-h-screen">
      {teamValid && decadeValid ? (
        <TeamRoster team={team} decade={decadeNum} query={query} />
      ) : teamValid ? (
        <TeamStack team={team} query={query} />
      ) : (
        <StacksGrid initialQuery={query} />
      )}
    </PageShell>
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
      <CardsSearchHeader query={q} onQueryChange={setQ} />

      {status === "loading" && (
        <div className="mt-12 text-center font-mono text-sm text-[var(--md-ink-muted)]">
          Loading teams…
        </div>
      )}
      {status === "error" && (
        <div className="mt-12 text-center font-mono text-sm text-[var(--md-coral)]">
          Couldn&rsquo;t load the league right now.
        </div>
      )}
      {status === "ok" && q.trim().length > 0 && stacks.length === 0 && !searching && (
        <div className="mt-12 text-center font-mono text-sm text-[var(--md-ink-muted)]">
          Nothing matches &ldquo;{q}&rdquo;.
        </div>
      )}

      {status === "ok" && stacks.length > 0 && (
        <>
          {/* Grid section header */}
          <div className="mt-8 flex items-baseline justify-between border-b border-[var(--md-ink)] pb-2">
            <span
              className="font-archivo uppercase"
              style={{ fontVariationSettings: '"wdth" 88', fontWeight: 800, fontSize: 20, letterSpacing: "-0.01em" }}
            >
              Browse by team
            </span>
            <span className="font-mono text-[12px] text-[var(--md-ink-muted)]">
              {stacks.length} deck{stacks.length === 1 ? "" : "s"} · every franchise era we have on file
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {stacks.map((s) => (
              <CardStack
                key={s.team}
                team={s.team}
                eras={s.decades.length}
                href={cardsHref({ team: s.team, q })}
              />
            ))}
          </div>
        </>
      )}

      <Link
        href="/"
        className="font-cond mx-auto mt-10 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--md-blue)] underline"
      >
        ← Back to daily82
      </Link>
    </section>
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
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 font-cond text-[11px] font-semibold uppercase tracking-[0.16em]">
        <Link
          href={cardsHref({ q: query })}
          className="text-[var(--md-blue)] underline"
        >
          ← Player cards
        </Link>
        <span className="text-[var(--md-ink-muted)]">/</span>
        <span className="text-[var(--md-ink)]">{team}</span>
      </div>

      {/* Section header */}
      <div className="mt-5 border-b-2 border-[var(--md-ink)] pb-3">
        <h1
          className="font-cover uppercase"
          style={{ fontSize: "clamp(38px, 9vw, 64px)", lineHeight: 0.9, letterSpacing: "-0.01em" }}
        >
          {team}
        </h1>
        {settled && eras.length > 0 && (
          <div className="mt-1 flex items-center gap-2">
            <span className="font-cond text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--md-ink-muted)]">
              {eras.length} era{eras.length === 1 ? "" : "s"}
            </span>
            <span className="font-mono text-[11px] text-[var(--md-ink-muted)]">
              · pick an era to browse its roster
            </span>
          </div>
        )}
      </div>

      {status === "loading" && (
        <div className="mt-10 text-center font-mono text-sm text-[var(--md-ink-muted)]">
          Loading eras…
        </div>
      )}
      {status === "error" && (
        <div className="mt-10 text-center font-mono text-sm text-[var(--md-coral)]">
          Couldn&rsquo;t load the league right now.
        </div>
      )}
      {settled && eras.length === 0 && (
        <div className="mt-10 text-center font-mono text-sm text-[var(--md-ink-muted)]">
          No eras on record for {team}
          {query.trim() ? ` matching "${query}"` : ""}.
        </div>
      )}

      {settled && eras.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {eras.map((c) => (
            <Link
              key={c.decade}
              href={cardsHref({ team, decade: c.decade, q: query })}
              className="group flex flex-col border-2 border-[var(--md-ink)] bg-[var(--md-white)] p-4 text-left transition-transform hover:-translate-y-0.5"
              style={{ boxShadow: "var(--md-shadow-md)" }}
            >
              <div
                className="font-cover leading-none"
                style={{ fontSize: "clamp(28px, 6vw, 40px)", letterSpacing: "-0.01em" }}
              >
                {c.decade}s
              </div>
              <div className="mt-2 font-cond text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--md-ink-muted)]">
                {team}
              </div>
              <div
                className="font-cond mt-0.5 text-[11px] font-bold uppercase tracking-[0.06em]"
                style={{ color: "var(--md-coral)" }}
              >
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
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 font-cond text-[11px] font-semibold uppercase tracking-[0.16em]">
        <Link
          href={cardsHref({ q: query })}
          className="text-[var(--md-blue)] underline"
        >
          ← Player cards
        </Link>
        <span className="text-[var(--md-ink-muted)]">/</span>
        <Link
          href={cardsHref({ team, q: query })}
          className="text-[var(--md-blue)] underline"
        >
          {team}
        </Link>
        <span className="text-[var(--md-ink-muted)]">/</span>
        <span className="text-[var(--md-ink)]">{decade}s</span>
      </div>

      {/* Section header */}
      <div className="mt-5 border-b-2 border-[var(--md-ink)] pb-3">
        <h1
          className="font-cover uppercase"
          style={{ fontSize: "clamp(38px, 9vw, 64px)", lineHeight: 0.9, letterSpacing: "-0.01em" }}
        >
          {team}
        </h1>
        <div className="mt-1 flex items-center gap-2">
          <span
            className="font-archivo uppercase"
            style={{ fontVariationSettings: '"wdth" 88', fontWeight: 800, fontSize: 18, color: "var(--md-coral)" }}
          >
            {decade}s
          </span>
          <span className="font-mono text-[11px] text-[var(--md-ink-muted)]">
            · tap any player to flip through their career card
          </span>
        </div>
      </div>

      <div className="mt-4">
        <PlayerList team={team} decade={decade} mode="classic" browse />
      </div>
    </section>
  );
}
