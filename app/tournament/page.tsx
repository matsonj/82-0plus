"use client";

import Link from "next/link";
import { TournamentLookup } from "@/components/TournamentLookup";
import { MOTHERDUCK_URL } from "@/lib/site";

// Lookup-only landing. You ENTER the tournament from a finished Classic/Ranked
// game (the "Enter Tournament" button on the results), which carries your drafted
// five + mode in. This page is just for checking your bracket later by name + PIN.
export default function TournamentPage() {
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
        <span className="md-capsule" style={{ background: "var(--md-orange)" }}>
          Tournament Edition
        </span>
      </header>

      <section className="relative z-10 flex flex-col items-center text-center">
        <div className="md-capsule mb-4">🏀 Check your team</div>
        <h1
          className="font-display font-bold tracking-tight"
          style={{ fontSize: "clamp(34px, 9vw, 64px)", lineHeight: 1 }}
        >
          How far did you get?
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[14px] leading-relaxed sm:text-[15px]">
          Look up your bracket by name + PIN. Haven&rsquo;t entered yet? Play a{" "}
          <Link href="/" className="text-[var(--md-blue)] underline">
            Classic or Ranked
          </Link>{" "}
          season, then hit <strong>Enter Tournament</strong> on your result.
        </p>

        <div className="mt-8 w-full max-w-md">
          <TournamentLookup onBack={undefined} />
        </div>

        <Link
          href="/"
          className="mt-6 font-display text-xs font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
        >
          ← Back to 82-0+
        </Link>
      </section>

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
