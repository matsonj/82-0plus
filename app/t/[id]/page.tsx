"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { BracketResult } from "@/lib/types";
import { BracketView } from "@/components/BracketView";
import { GlobalHeader } from "@/components/GlobalHeader";

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
    <main className="relative mx-auto flex min-h-full max-w-3xl flex-col overflow-x-hidden px-4 pb-12 sm:pb-16">
      <div className="md-sunbeam" />
      <GlobalHeader />

      <section className="relative z-10 mt-4">
        {status === "loading" && (
          <div className="py-20 text-center font-display text-sm text-[var(--md-ink-muted)]">
            Loading the bracket…
          </div>
        )}
        {status === "error" && (
          <div className="md-card md-card--lift mx-auto max-w-md p-5 text-center">
            <p className="font-display text-base font-bold">
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
          <div className="flex flex-col gap-5">
            <div className="text-center">
              <div className="md-capsule md-capsule--teal mb-2">
                🏆 {bracket.championName}
              </div>
              <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                Champion
              </div>
            </div>
            <BracketView bracket={bracket} sharedBoard={daily} />
          </div>
        )}
      </section>
    </main>
  );
}
