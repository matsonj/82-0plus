"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { BracketResult } from "@/lib/types";
import { BracketView } from "@/components/BracketView";
import { PageShell } from "@/components/layout/PageShell";

type Status = "loading" | "ok" | "error";

// Public, read-only bracket view: GET /api/tournament/bracket?id=<uuid>.
// The endpoint returns only { bracket } (no `you`), so nothing is highlighted.
export default function PublicBracketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [status, setStatus] = useState<Status>("loading");
  const [bracket, setBracket] = useState<BracketResult | null>(null);
  const [daily, setDaily] = useState(false);
  const [tournamentName, setTournamentName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    fetch(`/api/tournament/bracket?id=${encodeURIComponent(id)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (active) {
          setBracket((d.bracket as BracketResult) ?? null);
          setDaily(!!d.daily);
          setTournamentName((d.tournamentName as string | null) ?? null);
          setStatus("ok");
        }
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <PageShell
      width="wide"
      paddingClassName="px-4 pb-12 sm:px-6 sm:pb-16"
      footer={false}
    >
      <section className="relative z-10">
        {status === "loading" && (
          <div className="py-20 text-center font-cond text-sm uppercase tracking-widest text-[var(--md-ink-muted)]">
            Loading the bracket…
          </div>
        )}
        {status === "error" && (
          <div
            className="mx-auto max-w-md border-2 border-[var(--md-ink)] bg-[var(--md-white)] p-5 text-center"
            style={{ boxShadow: "var(--md-shadow-md)" }}
          >
            <p className="font-cond text-base font-semibold uppercase tracking-wide">
              Bracket not found.
            </p>
            <Link
              href="/tournament"
              className="md-btn md-btn--sm md-btn--secondary mt-4 inline-flex"
            >
              Go to the tournament
            </Link>
          </div>
        )}
        {status === "ok" && bracket && (
          <div className="flex flex-col gap-6">
            {/* Page header: kicker + title + champion badge */}
            <div className="flex flex-col gap-1 border-b-2 border-[var(--md-ink)] pb-5 md:flex-row md:items-start md:justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <span className="font-byline text-[11px] uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
                    Public Bracket
                  </span>
                  <span className="font-byline text-[11px] text-[var(--md-ink-muted)]">
                    daily82.com/t/{id}
                  </span>
                </div>
                <h1
                  className="font-cover leading-none text-[var(--md-ink)]"
                  style={{ fontSize: "clamp(28px, 5vw, 56px)", textTransform: "uppercase" }}
                >
                  {tournamentName ?? "The Bracket"}
                </h1>
                <div className="font-byline text-[11px] uppercase tracking-[0.1em] text-[var(--md-ink-muted)]">
                  Final · {bracket.teams?.length ?? "?"} Teams · Single Elim
                </div>
              </div>
              {/* Champion badge — top-right on desktop */}
              <div
                className="mt-3 flex shrink-0 items-center gap-3 self-start border-2 border-[var(--md-ink)] px-4 py-3 md:mt-0"
                style={{ background: "var(--md-yellow)", boxShadow: "var(--md-shadow-sm)" }}
              >
                <span className="text-[22px]">♛</span>
                <div>
                  <div className="font-cond text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--md-ink)]">
                    Champion
                  </div>
                  <div
                    className="font-archivo leading-tight text-[var(--md-ink)]"
                    style={{ fontSize: 20, fontWeight: 800, fontVariationSettings: '"wdth" 100' }}
                  >
                    {bracket.championName}
                  </div>
                </div>
              </div>
            </div>

            {/* The bracket tree — BracketView renders horizontal on desktop, stacked on mobile */}
            <BracketView bracket={bracket} sharedBoard={daily} />

            {/* CTA footer */}
            <div
              className="mt-4 flex flex-col gap-2 border-2 border-[var(--md-ink)] bg-[var(--md-coral)] p-6 text-[var(--md-white)] md:flex-row md:items-center md:justify-between"
              style={{ boxShadow: "var(--md-shadow-pop)" }}
            >
              <div>
                <div className="font-byline text-[11px] italic text-[var(--md-paper)]">
                  Your league. Your bragging rights.
                </div>
                <div
                  className="font-cover text-[var(--md-paper)]"
                  style={{ fontSize: "clamp(20px, 3.5vw, 36px)", textTransform: "uppercase", lineHeight: 1.05 }}
                >
                  Build Your Own Bracket
                </div>
              </div>
              <Link
                href="/"
                className="md-btn md-btn--lg md-btn--secondary shrink-0 border-[var(--md-paper)] text-[var(--md-paper)] hover:bg-[var(--md-paper)] hover:text-[var(--md-ink)]"
              >
                daily82.com →
              </Link>
            </div>
          </div>
        )}
      </section>
    </PageShell>
  );
}
