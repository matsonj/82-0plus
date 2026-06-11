"use client";

import { use } from "react";
import Link from "next/link";
import { TournamentLookup } from "@/components/TournamentLookup";
import { GlobalHeader } from "@/components/GlobalHeader";
import { MOTHERDUCK_URL } from "@/lib/site";

// Lookup-only landing. You ENTER the tournament from a finished Classic/Ranked
// game (the "Enter Tournament" button on the results), which carries your drafted
// five + mode in. This page is just for checking your bracket later by name + PIN.
// `?tab=private` deep-links straight to the Private filter (from the main menu).
export default function TournamentPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; daily?: string }>;
}) {
  const { tab, daily } = use(searchParams);
  const initialTab = tab === "private" ? ("private" as const) : undefined;
  // `?daily=YYYY-MM-DD` (from a home-calendar click) auto-opens that day's bracket.
  const initialDaily = /^\d{4}-\d{2}-\d{2}$/.test(daily ?? "") ? daily : undefined;
  return (
    <main className="relative mx-auto flex min-h-full max-w-3xl flex-col overflow-x-hidden px-4 pb-12 sm:pb-16">
      <div className="md-sunbeam" />

      <GlobalHeader />

      <section className="relative z-10 mt-6 flex flex-col items-center text-center sm:mt-8">
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
          <TournamentLookup
            onBack={undefined}
            initialTab={initialTab}
            initialDaily={initialDaily}
          />
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
