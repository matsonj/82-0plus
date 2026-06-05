"use client";

import { useState } from "react";
import Link from "next/link";
import { TournamentEntry } from "@/components/TournamentEntry";
import { TournamentLookup } from "@/components/TournamentLookup";

type View = "landing" | "enter" | "lookup";

export default function TournamentPage() {
  const [view, setView] = useState<View>("landing");

  return (
    <main className="relative mx-auto flex min-h-full max-w-3xl flex-col overflow-x-hidden px-4 pb-12 sm:pb-16">
      <div className="md-sunbeam" />

      <header className="relative z-10 flex items-center justify-between py-4 sm:py-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            🦆
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            82-0<span className="text-[var(--md-orange)]">+</span>
          </span>
        </Link>
        <span
          className="md-capsule"
          style={{ background: "var(--md-orange)" }}
        >
          NBA JAM Edition
        </span>
      </header>

      {view === "landing" && (
        <section className="relative z-10 flex flex-col items-center text-center">
          <div className="md-capsule mb-4">🏀 Tournament Edition</div>
          <h1
            className="font-display font-bold tracking-tight"
            style={{ fontSize: "clamp(34px, 9vw, 64px)", lineHeight: 1 }}
          >
            Draft. Seed. Win it all.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[14px] leading-relaxed sm:text-[15px]">
            Six rounds: draft five starters plus a sixth man, name a captain,
            and claim your team. We seed you into a 16-team bracket and play it
            out, East vs. West, all the way to the Final.
          </p>

          <div className="mt-8 grid w-full max-w-md gap-3 sm:grid-cols-2">
            <button
              className="md-card md-card--lift p-5 text-left transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--md-orange)" }}
              onClick={() => setView("enter")}
            >
              <div className="font-display text-xl font-bold">
                Enter the tournament
              </div>
              <p className="mt-1 text-[13px] text-[var(--md-ink)]">
                Build a roster and find out how far it goes.
              </p>
            </button>
            <button
              className="md-card md-card--lift p-5 text-left transition-transform hover:-translate-y-0.5"
              onClick={() => setView("lookup")}
            >
              <div className="font-display text-xl font-bold">Check your team</div>
              <p className="mt-1 text-[13px] text-[var(--md-ink-muted)]">
                Already entered? Look up your bracket by name + PIN.
              </p>
            </button>
          </div>

          <Link
            href="/"
            className="mt-6 font-display text-xs font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
          >
            ← Back to 82-0+
          </Link>
        </section>
      )}

      {view === "enter" && (
        <section className="relative z-10 mt-4">
          <TournamentEntry onBack={() => setView("landing")} />
        </section>
      )}

      {view === "lookup" && (
        <section className="relative z-10 mt-4">
          <TournamentLookup onBack={() => setView("landing")} />
        </section>
      )}

      <footer className="relative z-10 mt-auto pt-12 text-center">
        <p className="font-display text-xs text-[var(--md-ink-muted)]">
          Powered by MotherDuck · <code>nba_box_scores_v2</code>
        </p>
        <p className="mt-2 text-[11px] text-[var(--md-ink-muted)]">
          An independent project, not affiliated with or endorsed by the NBA.
        </p>
      </footer>
    </main>
  );
}
