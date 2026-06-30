"use client";

import { use, useState, useCallback } from "react";
import Link from "next/link";
import { TournamentLookup, type LookupChrome } from "@/components/TournamentLookup";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";

// Lookup-only landing. You ENTER the tournament from a finished Classic/Ranked
// game (the "Enter Tournament" button on the results), which carries your drafted
// five + mode in. This page is just for checking your bracket later by name + PIN.
// `?tab=private` deep-links straight to the Private filter (from the main menu).
export default function TournamentPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; daily?: string; team?: string }>;
}) {
  const { tab, daily, team } = use(searchParams);
  const initialTab = tab === "private" ? ("private" as const) : undefined;
  // `?daily=YYYY-MM-DD` (from a home-calendar click) auto-opens that day's bracket.
  const initialDaily = /^\d{4}-\d{2}-\d{2}$/.test(daily ?? "") ? daily : undefined;
  // `?team=<uuid>` (from "Review your team") opens that one bracket directly,
  // skipping the all-teams lookup; `daily` carries the date for the result chrome.
  const initialTeam = /^[0-9a-fA-F-]{36}$/.test(team ?? "") ? team : undefined;

  // The logged-out lookup landing ("lookup") is the only state that shows the
  // "HOW FAR DID YOU GET?" masthead + "earn your way in" sidebar (two-column).
  // The logged-in list ("list") and an open bracket result ("result") go
  // full-width with no page hero/sidebar — they bring their own headers.
  const [chrome, setChrome] = useState<LookupChrome>("lookup");
  const handleChrome = useCallback((mode: LookupChrome) => {
    setChrome(mode);
  }, []);
  const showLookupChrome = chrome === "lookup";

  return (
    <PageShell
      width="wide"
      paddingClassName="px-4 pb-16 sm:pb-20"
      footerCentered
    >
      {/* Page masthead: folio bar + cover-line headline.
          Only in the logged-out lookup state. Hidden for the logged-in list
          (it owns its own "MY TEAMS" title) and bracket results (their own
          masthead) — both of those go full-width. */}
      {showLookupChrome && (
        <PageHeader
          className="mt-4 sm:mt-6"
          eyebrowVariant="line"
          eyebrowLeft="MY TEAMS · THE BRACKET DESK"
          contentClassName="mt-3"
          kicker="Roll call"
          kickerClassName="font-byline mb-1 block text-[18px] italic text-[var(--md-coral)]"
          title={<>HOW FAR DID<br />YOU GET?</>}
          titleClassName="leading-none"
          titleStyle={{
            fontSize: "clamp(48px, 12vw, 100px)",
            letterSpacing: "-0.02em",
          }}
          description={
            <>
              Look up your bracket by name + PIN. Haven&rsquo;t entered yet? Play a{" "}
              <Link href="/" className="font-bold text-[var(--md-blue)] underline">
                Classic or Ranked
              </Link>{" "}
              season, then hit <strong>Enter Playoffs</strong> on your result.
            </>
          }
        />
      )}

      {/* Double rule under masthead — only in lookup state */}
      {showLookupChrome && <div className="md-rule-double relative z-10 mt-6" />}

      {/* Main content.
          TournamentLookup is always mounted (single instance preserves its
          internal state). Only the logged-out lookup state is two-column with
          the sidebar; the logged-in list and bracket results fill the full
          width via CSS; no remount. */}
      <div className={`relative z-10 mt-8 ${showLookupChrome ? "lg:grid lg:grid-cols-[1fr_320px] lg:gap-8" : ""}`}>
        {/* The lookup widget — fills the left column in the lookup state, or
            full width in the list / result states. */}
        <TournamentLookup
          onBack={undefined}
          initialTab={initialTab}
          initialDaily={initialDaily}
          initialTeam={initialTeam}
          onChrome={handleChrome}
        />

        {/* Right sidebar — earn-your-way-in callout (logged-out lookup, desktop
            only). Hidden once you're logged in or viewing a result. */}
        {showLookupChrome && (
          <aside className="hidden flex-col gap-6 lg:flex">
            <div>
              <div className="mb-1 font-cond text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--md-ink-muted)]">
                No bracket yet?
              </div>
              <div
                className="font-archivo uppercase leading-tight"
                style={{ fontSize: 28, fontWeight: 800, fontVariationSettings: '"wdth" 88' }}
              >
                Earn your way in.
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--md-ink-muted)]">
                Every Classic and Ranked season can be entered into the playoffs.
                Finish a draft, then send your roster to a bracket.
              </p>
            </div>

            <div className="flex flex-col gap-0 border-t-2 border-[var(--md-ink)]">
              {[
                { label: "Play Classic", href: "/" },
                { label: "Play Ranked", href: "/" },
                { label: "Host a Tournament", href: "/tournament?tab=private", cobalt: true },
              ].map(({ label, href, cobalt }) => (
                <Link
                  key={label}
                  href={href}
                  className="flex items-center justify-between border-b border-[var(--md-paper-3)] py-3 font-cond text-[13px] font-semibold uppercase tracking-[0.1em] transition-colors hover:text-[var(--md-coral)]"
                  style={cobalt ? { color: "var(--md-cobalt)" } : undefined}
                >
                  {label}
                  <span className="shrink-0">→</span>
                </Link>
              ))}
            </div>
          </aside>
        )}
      </div>
    </PageShell>
  );
}
